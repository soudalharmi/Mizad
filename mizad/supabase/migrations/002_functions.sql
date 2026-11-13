-- All money-moving logic lives here, executed atomically. Only the server (service_role) may call these.

-- ===== PLACE A BID =====
create function place_bid(p_user uuid,p_item uuid,p_amount bigint,p_idem text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare it auction_items; b bidders; v vendors; nb bids; minb bigint;
begin
  select * into it from auction_items where id=p_item for update;           -- row lock: serialises concurrent bids
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into nb from bids where idem_key=p_idem and item_id=p_item;       -- duplicate submission => same result
  if found then return to_jsonb(nb); end if;
  select * into v from vendors where id=it.vendor_id;
  if v.status<>'active' then raise exception 'VENDOR_INACTIVE'; end if;
  if it.status<>'live' then raise exception 'AUCTION_CLOSED'; end if;
  select * into b from bidders where user_id=p_user and vendor_id=it.vendor_id and status='approved' and phone_verified;
  if not found then raise exception 'NOT_APPROVED'; end if;
  if it.leader_bidder_id=b.id then raise exception 'ALREADY_LEADING'; end if;
  minb:=case when it.leader_bidder_id is null then it.start_price_fils else it.current_price_fils+it.increment_fils end;
  if p_amount<minb then raise exception 'TOO_LOW'; end if;
  if (p_amount-it.start_price_fils)%it.increment_fils<>0 then raise exception 'INVALID_STEP'; end if;

  -- previous leader is outbid: authorised support is RELEASED (never transferred to the new leader)
  update payments set provider_sync='cancel_needed' where provider_sync='none' and id in
    (select payment_id from support_contributions where item_id=p_item and status in('authorized','pending_payment') and payment_id is not null);
  update support_contributions set status='released' where item_id=p_item and status='authorized';
  update support_contributions set status='expired' where item_id=p_item and status='pending_payment';

  insert into bids(vendor_id,item_id,bidder_id,bidder_name,amount_fils,idem_key)
    values(it.vendor_id,p_item,b.id,b.name,p_amount,p_idem) returning * into nb;
  update auction_items set current_price_fils=p_amount,base_bid_fils=p_amount,leader_bidder_id=b.id,leader_name=b.name,
    bid_count=bid_count+1,version=version+1 where id=p_item;
  -- AED 2.50 once per item: unique(item_id) makes this idempotent
  insert into item_service_fees(vendor_id,item_id,amount_fils)
    select it.vendor_id,p_item,item_fee_fils from platform_settings on conflict(item_id) do nothing;
  perform audit(it.vendor_id,p_user,'bid.placed','bid',nb.id,jsonb_build_object('amount',p_amount));
  return to_jsonb(nb);
end $$;

-- ===== REQUEST SUPPORT (server computes the contribution; browser only proposes a price) =====
create function request_support(p_user uuid,p_item uuid,p_new_price bigint,p_idem text) returns support_contributions
language plpgsql security definer set search_path=public as $$
declare it auction_items; v vendors; s bidders; c support_contributions; hold int;
begin
  select * into c from support_contributions where idem_key=p_idem;
  if found then return c; end if;
  select * into it from auction_items where id=p_item for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v from vendors where id=it.vendor_id;
  if v.status<>'active' then raise exception 'VENDOR_INACTIVE'; end if;
  if it.status<>'live' then raise exception 'AUCTION_CLOSED'; end if;
  if it.leader_bidder_id is null then raise exception 'NO_LEADER'; end if;
  select * into s from bidders where user_id=p_user and vendor_id=it.vendor_id and status='approved' and phone_verified;
  if not found then raise exception 'NOT_APPROVED'; end if;
  if s.id=it.leader_bidder_id then raise exception 'SELF_SUPPORT'; end if;
  if p_new_price<=it.current_price_fils then raise exception 'TOO_LOW'; end if;
  if (p_new_price-it.start_price_fils)%it.increment_fils<>0 then raise exception 'INVALID_STEP'; end if;
  select support_hold_minutes into hold from platform_settings;
  update payments set provider_sync='cancel_needed' where provider_sync='none' and id in
    (select payment_id from support_contributions where item_id=p_item and supporter_id=s.id and status='pending_payment' and payment_id is not null);
  update support_contributions set status='expired' where item_id=p_item and supporter_id=s.id and status='pending_payment';
  insert into support_contributions(vendor_id,item_id,supporter_id,supporter_name,beneficiary_id,beneficiary_name,
    price_before_fils,price_after_fils,amount_fils,idem_key,expires_at)
  values(it.vendor_id,p_item,s.id,s.name,it.leader_bidder_id,it.leader_name,it.current_price_fils,p_new_price,
    p_new_price-it.current_price_fils,p_idem,now()+make_interval(mins=>hold)) returning * into c;
  perform audit(it.vendor_id,p_user,'support.requested','support',c.id,jsonb_build_object('amount',c.amount_fils));
  return c;
end $$;

create function attach_support_payment(p_contribution uuid,p_ref text) returns uuid
language plpgsql security definer set search_path=public as $$
declare pid uuid; c support_contributions;
begin
  select * into c from support_contributions where id=p_contribution;
  insert into payments(vendor_id,kind,payer_user_id,amount_fils,provider_ref,idem_key)
    values(c.vendor_id,'support',(select user_id from bidders where id=c.supporter_id),c.amount_fils,p_ref,'support-'||c.id)
    on conflict(provider_ref) do nothing returning id into pid;
  if pid is null then select id into pid from payments where provider_ref=p_ref; end if;
  update support_contributions set payment_id=pid where id=p_contribution;
  return pid;
end $$;

-- ===== PAYMENT AUTHORISED (called by verified webhook only) =====
create function confirm_support(p_ref text) returns text
language plpgsql security definer set search_path=public as $$
declare pay payments; c support_contributions; it auction_items;
begin
  select * into pay from payments where provider_ref=p_ref;
  if not found then return 'UNKNOWN'; end if;
  select * into c from support_contributions where payment_id=pay.id;
  if not found then return 'UNKNOWN'; end if;
  select * into it from auction_items where id=c.item_id for update;        -- same lock order as place_bid
  select * into c from support_contributions where id=c.id for update;
  if c.status in('authorized','captured') then return 'OK'; end if;          -- idempotent
  if c.status<>'pending_payment' or c.expires_at<now() or it.status<>'live'
     or it.current_price_fils<>c.price_before_fils or it.leader_bidder_id<>c.beneficiary_id then
    update support_contributions set status='expired' where id=c.id and status='pending_payment';
    update payments set provider_sync='cancel_needed' where id=pay.id and provider_sync='none';
    return 'REJECTED';                                                       -- hold is released, nobody is charged
  end if;
  update support_contributions set status='authorized' where id=c.id;
  update payments set status='authorized' where id=pay.id;
  -- beneficiary stays the winner; price = base bid + sum of confirmed contributions
  update auction_items set current_price_fils=c.price_after_fils,version=version+1 where id=it.id;
  insert into notifications(user_id,vendor_id,type,body)
    select user_id,c.vendor_id,'support.received',c.supporter_name||' +'||c.amount_fils from bidders where id=c.beneficiary_id;
  perform audit(c.vendor_id,null,'support.authorized','support',c.id,jsonb_build_object('amount',c.amount_fils));
  return 'OK';
end $$;

create function fail_support(p_ref text) returns void language plpgsql security definer set search_path=public as $$
declare pay payments;
begin
  select * into pay from payments where provider_ref=p_ref; if not found then return; end if;
  update payments set status='failed' where id=pay.id and status in('requires_action');
  update support_contributions set status='failed' where payment_id=pay.id and status='pending_payment';
end $$;

-- ===== VENDOR CONTROLS: open / pause / close / next =====
create function vendor_item_action(p_user uuid,p_item uuid,p_action text) returns uuid
language plpgsql security definer set search_path=public as $$
declare it auction_items; nxt uuid;
begin
  select * into it from auction_items where id=p_item for update;
  if not found or not exists(select 1 from vendors where id=it.vendor_id and owner_id=p_user and status='active') then
    raise exception 'FORBIDDEN'; end if;
  if p_action='open' then
    if it.status not in('queued','paused') then raise exception 'AUCTION_CLOSED'; end if;
    update auction_items set status='paused' where vendor_id=it.vendor_id and status='live' and id<>p_item;
    update auction_items set status='live',opened_at=coalesce(opened_at,now()) where id=p_item;
  elsif p_action='pause' then
    update auction_items set status='paused' where id=p_item and status='live';
  elsif p_action in('close','next') then
    if it.status in('live','paused') then
      update auction_items set status=case when it.leader_bidder_id is null then 'unsold' else 'sold' end,closed_at=now() where id=p_item;
      -- winner's authorised support is captured; anything unpaid is cancelled
      update payments set provider_sync='capture_needed' where provider_sync='none' and status='authorized' and id in
        (select payment_id from support_contributions where item_id=p_item and status='authorized');
      update payments set provider_sync='cancel_needed' where provider_sync='none' and id in
        (select payment_id from support_contributions where item_id=p_item and status='pending_payment' and payment_id is not null);
      update support_contributions set status='expired' where item_id=p_item and status='pending_payment';
    end if;
    if p_action='next' then
      select id into nxt from auction_items where vendor_id=it.vendor_id and status='queued' order by position,created_at limit 1;
      if nxt is not null then
        update auction_items set status='live',opened_at=now() where id=nxt;
      end if;
    end if;
  else raise exception 'BAD_ACTION'; end if;
  perform audit(it.vendor_id,p_user,'item.'||p_action,'item',p_item);
  return nxt;
end $$;

-- ===== PROVIDER SYNC (server calls Stripe, then confirms here) =====
create function finish_provider_sync(p_payment uuid) returns void
language plpgsql security definer set search_path=public as $$
declare pay payments;
begin
  select * into pay from payments where id=p_payment for update;
  if pay.provider_sync='cancel_needed' then
    update payments set status='canceled',provider_sync='none' where id=pay.id;
  elsif pay.provider_sync='capture_needed' then
    update payments set status='captured',provider_sync='none' where id=pay.id;
    update support_contributions set status='captured' where payment_id=pay.id and status='authorized';
  elsif pay.provider_sync='refund_needed' then
    update payments set status='refunded',provider_sync='none' where id=pay.id;
    update support_contributions set status='refunded' where payment_id=pay.id and status='refund_pending';
    update refunds set status='succeeded' where payment_id=pay.id and status='pending';
  end if;
  perform audit(pay.vendor_id,null,'payment.sync','payment',pay.id,jsonb_build_object('sync',pay.provider_sync));
end $$;

-- Admin-triggered refund of a captured contribution (never silently re-assigned)
create function refund_contribution(p_contribution uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare c support_contributions;
begin
  select * into c from support_contributions where id=p_contribution for update;
  if c.status<>'captured' then raise exception 'NOT_REFUNDABLE'; end if;
  update support_contributions set status='refund_pending' where id=c.id;
  insert into refunds(payment_id,contribution_id,amount_fils,reason) values(c.payment_id,c.id,c.amount_fils,p_reason);
  update payments set provider_sync='refund_needed' where id=c.payment_id;
  perform audit(c.vendor_id,null,'refund.requested','support',c.id,jsonb_build_object('reason',p_reason));
end $$;

-- ===== BILLING =====
create function generate_invoice(p_vendor uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare inv uuid; tot bigint;
begin
  perform 1 from vendors where id=p_vendor for update;
  if not exists(select 1 from item_service_fees where vendor_id=p_vendor and invoice_id is null) then return null; end if;
  insert into invoices(vendor_id) values(p_vendor) returning id into inv;
  update item_service_fees set invoice_id=inv where vendor_id=p_vendor and invoice_id is null;
  select sum(amount_fils) into tot from item_service_fees where invoice_id=inv;
  update invoices set total_fils=tot where id=inv;
  return inv;
end $$;

create function run_billing() returns int language plpgsql security definer set search_path=public as $$
declare s platform_settings; r record; n int:=0;
begin
  select * into s from platform_settings;
  if s.billing_mode='manual' then return 0; end if;
  for r in select vendor_id,sum(amount_fils) t from item_service_fees where invoice_id is null group by vendor_id loop
    if s.billing_mode='per_session' and exists(select 1 from auction_items i where i.vendor_id=r.vendor_id and i.status in('live','paused')) then continue; end if;
    if s.billing_mode='threshold' and r.t<s.billing_threshold_fils then continue; end if;
    perform generate_invoice(r.vendor_id); n:=n+1;
  end loop;
  return n;
end $$;

create function mark_invoice_paid(p_invoice uuid,p_ref text) returns void language plpgsql security definer set search_path=public as $$
declare inv invoices;
begin
  select * into inv from invoices where id=p_invoice for update;
  if inv.status='paid' then return; end if;
  insert into payments(vendor_id,kind,amount_fils,provider_ref,status) values(inv.vendor_id,'invoice',inv.total_fils,p_ref,'captured') on conflict(provider_ref) do nothing;
  update invoices set status='paid',paid_at=now() where id=p_invoice;
end $$;

create function activate_vendor(p_vendor uuid,p_amount bigint,p_ref text) returns void language plpgsql security definer set search_path=public as $$
declare pid uuid;
begin
  if exists(select 1 from vendor_activation_payments where vendor_id=p_vendor) then return; end if;   -- charged once only
  if p_amount>0 then
    insert into payments(vendor_id,kind,amount_fils,provider_ref,status) values(p_vendor,'activation',p_amount,p_ref,'captured')
      on conflict(provider_ref) do nothing returning id into pid;
  end if;
  insert into vendor_activation_payments(vendor_id,payment_id,amount_fils) values(p_vendor,pid,p_amount) on conflict do nothing;
  update vendors set status='active',activated_at=now() where id=p_vendor and status='pending_activation';
  perform audit(p_vendor,null,'vendor.activated','vendor',p_vendor);
end $$;

-- ===== ADMIN OVERVIEW =====
create function admin_overview() returns jsonb language sql security definer set search_path=public as $$
select jsonb_build_object(
 'vendors',(select count(*) from vendors),
 'active_vendors',(select count(*) from vendors where status='active'),
 'bidders',(select count(*) from bidders),
 'auctions',(select count(*) from auctions),
 'items',(select count(*) from auction_items),
 'chargeable_items',(select count(*) from item_service_fees),
 'activation_revenue_fils',(select coalesce(sum(amount_fils),0) from vendor_activation_payments),
 'service_fee_revenue_fils',(select coalesce(sum(total_fils),0) from invoices where status='paid'),
 'outstanding_fils',(select coalesce(sum(f.amount_fils),0) from item_service_fees f where not exists(select 1 from invoices i where i.id=f.invoice_id and i.status='paid')),
 'vendors_list',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'slug',v.slug,'status',v.status,
    'items',(select count(*) from item_service_fees f where f.vendor_id=v.id),
    'fees_fils',(select coalesce(sum(amount_fils),0) from item_service_fees f where f.vendor_id=v.id))),'[]'::jsonb) from vendors v),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]'::jsonb)
    from (select id,vendor_id,kind,amount_fils,status,created_at from payments order by created_at desc limit 50) p)
) $$;

-- Lock everything: functions are callable by the server only.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function is_admin(),owns_vendor(uuid) to anon,authenticated;   -- needed by RLS policies
grant execute on all functions in schema public to service_role;
