-- 029 Supporter payments in My Sales.
-- Only supporters of the auction WINNER count (support given to someone who was outbid was already released).
-- The sale price is shared: buyer pays (price − supports), each supporter pays their own support.
-- The owner can only be paid once the buyer AND every supporter have paid in full.

create table if not exists sale_supports(
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id),
  product_id uuid not null references sale_products(id),
  contribution_id uuid not null unique references support_contributions(id),
  supporter_name text not null, supporter_phone text, supporter_user_id uuid,
  winner_name text not null,
  amount_fils bigint not null check(amount_fils>0),
  inv_no text not null,
  created_at timestamptz not null default now());
create index if not exists sale_supports_product on sale_supports(product_id);
alter table sale_supports enable row level security;
drop policy if exists ss_read on sale_supports;
create policy ss_read on sale_supports for select using(owns_vendor(vendor_id));
grant select on sale_supports to authenticated;

alter table sale_products add column if not exists support_fils bigint not null default 0;
alter table sale_payments add column if not exists support_id uuid references sale_supports(id);
alter table sale_payments drop constraint if exists sale_payments_kind_check;
alter table sale_payments add constraint sale_payments_kind_check check(kind in('buyer','owner','supporter'));

-- copies the winner's supporters into My Sales (safe to run many times)
create or replace function sm_sync_supports(p_product uuid) returns void
language plpgsql security definer set search_path=public as $fn$
declare sp sale_products; it auction_items; r record;
begin
  select * into sp from sale_products where id=p_product;
  if not found or sp.stage<>'sold' or sp.item_id is null then return; end if;
  select * into it from auction_items where id=sp.item_id;
  if it.leader_bidder_id is null then return; end if;
  for r in select sc.*, b.phone bphone, b.user_id buid from support_contributions sc join bidders b on b.id=sc.supporter_id
           where sc.item_id=sp.item_id and sc.beneficiary_id=it.leader_bidder_id and sc.status in('authorized','captured')
             and not exists(select 1 from sale_supports s where s.contribution_id=sc.id)
           order by sc.created_at loop
    insert into sale_supports(vendor_id,product_id,contribution_id,supporter_name,supporter_phone,supporter_user_id,winner_name,amount_fils,inv_no)
      values(sp.vendor_id,sp.id,r.id,r.supporter_name,r.bphone,r.buid,coalesce(it.leader_name,r.beneficiary_name),r.amount_fils,sm_next(sp.vendor_id,'sp'));
  end loop;
  update sale_products set support_fils=(select coalesce(sum(amount_fils),0) from sale_supports where product_id=sp.id) where id=sp.id;
end $fn$;

create or replace function sm_supports_trg() returns trigger language plpgsql security definer set search_path=public as $fn$
begin
  if new.stage='sold' and (tg_op='INSERT' or old.stage is distinct from 'sold') then
    begin perform sm_sync_supports(new.id);
    exception when others then insert into audit_logs(vendor_id,action,entity,entity_id,data) values(new.vendor_id,'sales.support_sync_error','sale_product',new.id,jsonb_build_object('err',sqlerrm)); end;
  end if;
  return null;
end $fn$;
drop trigger if exists t_sm_supports on sale_products;
create trigger t_sm_supports after insert or update of stage on sale_products for each row execute function sm_supports_trg();

-- buyer / owner payments now account for supporters
create or replace function sm_pay(p_user uuid,p_product uuid,p_kind text,p_amount bigint,p_method text,p_date date,p_ref text,p_notes text,p_receipt text) returns text
language plpgsql security definer set search_path=public as $fn$
declare vid uuid; sp sale_products; bp bigint; op bigint; spd bigint; no_ text;
begin
  vid:=sm_vendor(p_user);
  select * into sp from sale_products where id=p_product and vendor_id=vid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if sp.stage<>'sold' then raise exception 'NOT_SOLD'; end if;
  if p_kind not in('buyer','owner') then raise exception 'BAD_INPUT'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'BAD_AMOUNT'; end if;
  select coalesce(sum(amount_fils) filter(where kind='buyer'),0),coalesce(sum(amount_fils) filter(where kind='owner'),0),coalesce(sum(amount_fils) filter(where kind='supporter'),0)
    into bp,op,spd from sale_payments where product_id=sp.id;
  if p_kind='buyer' then
    if p_amount>sp.sale_price_fils-sp.support_fils-bp then raise exception 'OVER_DUE'; end if;
  else
    if bp<sp.sale_price_fils-sp.support_fils then raise exception 'BUYER_NOT_PAID'; end if;
    if spd<sp.support_fils then raise exception 'SUPPORTERS_NOT_PAID'; end if;
    if p_amount>sp.net_fils-op then raise exception 'OVER_DUE'; end if;
  end if;
  no_:=sm_next(vid,case when p_kind='buyer' then 'rc' else 'st' end);
  insert into sale_payments(vendor_id,product_id,kind,no,amount_fils,method,paid_on,ref,notes,receipt_path)
    values(vid,sp.id,p_kind,no_,p_amount,nullif(btrim(coalesce(p_method,'')),''),coalesce(p_date,(now() at time zone 'Asia/Dubai')::date),
      nullif(btrim(coalesce(p_ref,'')),''),nullif(btrim(coalesce(p_notes,'')),''),nullif(p_receipt,''));
  perform sm_log(vid,sp.id,p_user,case when p_kind='buyer' then 'buyer_paid' else 'owner_paid' end,jsonb_build_object('no',no_,'amount',p_amount,'method',p_method));
  return no_;
end $fn$;

create or replace function sm_pay_support(p_user uuid,p_support uuid,p_amount bigint,p_method text,p_date date,p_ref text,p_notes text,p_receipt text) returns text
language plpgsql security definer set search_path=public as $fn$
declare vid uuid; s sale_supports; paid bigint; no_ text;
begin
  vid:=sm_vendor(p_user);
  select * into s from sale_supports where id=p_support and vendor_id=vid;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform 1 from sale_products where id=s.product_id for update;
  if p_amount is null or p_amount<=0 then raise exception 'BAD_AMOUNT'; end if;
  select coalesce(sum(amount_fils),0) into paid from sale_payments where support_id=s.id;
  if p_amount>s.amount_fils-paid then raise exception 'OVER_DUE'; end if;
  no_:=sm_next(vid,'rc');
  insert into sale_payments(vendor_id,product_id,kind,support_id,no,amount_fils,method,paid_on,ref,notes,receipt_path)
    values(vid,s.product_id,'supporter',s.id,no_,p_amount,nullif(btrim(coalesce(p_method,'')),''),coalesce(p_date,(now() at time zone 'Asia/Dubai')::date),
      nullif(btrim(coalesce(p_ref,'')),''),nullif(btrim(coalesce(p_notes,'')),''),nullif(p_receipt,''));
  perform sm_log(vid,s.product_id,p_user,'supporter_paid',jsonb_build_object('no',no_,'amount',p_amount,'method',p_method,'supporter',s.supporter_name));
  return no_;
end $fn$;

create or replace function sm_reverse(p_user uuid,p_payment uuid,p_reason text) returns text
language plpgsql security definer set search_path=public as $fn$
declare vid uuid; pm sale_payments; op bigint; no_ text;
begin
  vid:=sm_vendor(p_user);
  if coalesce(btrim(p_reason),'')='' then raise exception 'REASON_REQUIRED'; end if;
  select * into pm from sale_payments where id=p_payment and vendor_id=vid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if pm.reversed or pm.reversal_of is not null then raise exception 'ALREADY_REVERSED'; end if;
  perform 1 from sale_products where id=pm.product_id for update;
  if pm.kind in('buyer','supporter') then
    select coalesce(sum(amount_fils),0) into op from sale_payments where product_id=pm.product_id and kind='owner';
    if op>0 then raise exception 'OWNER_ALREADY_PAID'; end if;
  end if;
  no_:=sm_next(vid,case when pm.kind='owner' then 'st' else 'rc' end);
  update sale_payments set reversed=true where id=pm.id;
  insert into sale_payments(vendor_id,product_id,kind,support_id,no,amount_fils,method,paid_on,ref,notes,reversal_of)
    values(vid,pm.product_id,pm.kind,pm.support_id,no_,-pm.amount_fils,pm.method,(now() at time zone 'Asia/Dubai')::date,pm.no,btrim(p_reason),pm.id);
  perform sm_log(vid,pm.product_id,p_user,'reversed',jsonb_build_object('no',pm.no,'amount',pm.amount_fils,'reason',btrim(p_reason),'kind',pm.kind));
  return no_;
end $fn$;

-- buyer's own view: show supporters' share so the buyer sees what he owes
create or replace function sm_my_buys(p_user uuid) returns jsonb
language sql security definer set search_path=public as $fn$
select coalesce(jsonb_agg(s.x order by s.x->>'sold_on' desc),'[]'::jsonb)
from (
select jsonb_build_object(
'id',p.id,'code',p.code,'name',p.name,'photo',p.photos[1],'vendor',v.name,'slug',v.slug,'currency',v.currency,
'inv_no',p.inv_no,'sold_on',p.sold_on,'price',p.sale_price_fils,'support',p.support_fils,'buyer',p.buyer_name,
'del_status',p.del_status,'del_company',p.del_company,'del_tracking',p.del_tracking,
'pays',coalesce((select jsonb_agg(jsonb_build_object('no',y.no,'amount',y.amount_fils,'paid_on',y.paid_on,'method',y.method,'rev',y.reversal_of is not null) order by y.created_at)
  from sale_payments y where y.product_id=p.id and y.kind='buyer'),'[]'::jsonb)
) as x
from sale_products p join vendors v on v.id=p.vendor_id
where p.stage='sold' and p.buyer_user_id=p_user
) s
$fn$;

-- owner's view: "buyer paid" now means everything collected (buyer + supporters)
create or replace function sm_my_owned(p_digits text) returns jsonb
language sql security definer set search_path=public as $fn$
select coalesce(jsonb_agg(s.x order by s.x->>'received_on' desc),'[]'::jsonb)
from (
select jsonb_build_object(
'id',p.id,'code',p.code,'name',p.name,'photo',p.photos[1],'vendor',v.name,'currency',v.currency,'method',p.method,'stage',p.stage,
'received_on',p.received_on,'price',p.sale_price_fils,'sold_on',p.sold_on,'commission',p.commission_fils,'listing',p.listing_fee_fils,
'listing_when',p.listing_when,'listing_upfront',p.listing_upfront,'net',p.net_fils,
'buyer_paid',coalesce((select sum(y.amount_fils) from sale_payments y where y.product_id=p.id and y.kind in('buyer','supporter')),0),
'pays',coalesce((select jsonb_agg(jsonb_build_object('no',y.no,'amount',y.amount_fils,'paid_on',y.paid_on,'method',y.method,'rev',y.reversal_of is not null) order by y.created_at)
  from sale_payments y where y.product_id=p.id and y.kind='owner'),'[]'::jsonb)
) as x
from sale_products p join sale_owners o on o.id=p.owner_id join vendors v on v.id=p.vendor_id
where o.portal and coalesce(p_digits,'')<>'' and regexp_replace(coalesce(o.phone,''),'\D','','g')=p_digits and p.stage<>'cancelled'
) s
$fn$;

revoke all on function sm_sync_supports(uuid) from public, anon, authenticated;
revoke all on function sm_supports_trg() from public, anon, authenticated;
revoke all on function sm_pay_support(uuid,uuid,bigint,text,date,text,text,text) from public, anon, authenticated;
grant execute on function sm_pay_support(uuid,uuid,bigint,text,date,text,text,text), sm_sync_supports(uuid) to service_role;

-- bring in supporters of sales that already happened
do $$ declare r record; begin
  for r in select id from sale_products where stage='sold' loop perform sm_sync_supports(r.id); end loop;
end $$;
