-- Update 18: minimum service fee per session (set by the admin in AED; stored as fils).
alter table platform_settings add column if not exists min_session_fee_fils bigint not null default 0 check(min_session_fee_fils>=0);

-- A fee row can now be a session top-up (no item) instead of a per-product fee.
alter table item_service_fees alter column item_id drop not null;
alter table item_service_fees add column if not exists auction_id uuid references auctions(id);
create unique index if not exists isf_one_topup_per_session on item_service_fees(auction_id) where item_id is null;

-- When a session ends: if its product fees are below the minimum, add the difference once.
create or replace function end_session(p_user uuid) returns int
language plpgsql security definer set search_path=public as $fn$
declare v vendors; s auctions; r record; n int:=0; minf bigint; tot bigint;
begin
  select * into v from vendors where owner_id=p_user and status='active';
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into s from auctions where vendor_id=v.id and status='live';
  if not found then raise exception 'NO_SESSION'; end if;
  for r in select id from auction_items where auction_id=s.id and status in('live','paused') loop
    perform vendor_item_action(p_user,r.id,'close'); n:=n+1;
  end loop;
  update auctions set status='ended',ended_at=now() where id=s.id;
  select min_session_fee_fils into minf from platform_settings;
  select coalesce(sum(f.amount_fils),0) into tot from item_service_fees f join auction_items i on i.id=f.item_id where i.auction_id=s.id;
  if minf>tot then
    insert into item_service_fees(vendor_id,item_id,auction_id,amount_fils) values(v.id,null,s.id,minf-tot)
      on conflict (auction_id) where item_id is null do nothing;
  end if;
  perform audit(v.id,p_user,'session.ended','session',s.id);
  return n;
end $fn$;
