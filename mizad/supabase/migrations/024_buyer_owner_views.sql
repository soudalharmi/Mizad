-- 024: buyers see their invoices in purchases; owners see their sales in their profile.

-- Part A: link a sale to the buyer's account, and an owner switch
alter table sale_products add column if not exists buyer_user_id uuid;
alter table sale_owners add column if not exists portal boolean not null default true;
update sale_owners set portal=true;

create or replace function sm_buyer_user() returns trigger
language plpgsql security definer set search_path=public as $fn$
begin
  if new.stage='sold' and new.buyer_user_id is null
     and new.item_id is not null then
    select b.user_id into new.buyer_user_id
      from auction_items i
      join bidders b on b.id=i.leader_bidder_id
      where i.id=new.item_id;
  end if;
  return new;
end $fn$;

drop trigger if exists t_sm_buyer_user on sale_products;
create trigger t_sm_buyer_user
  before insert or update on sale_products
  for each row execute function sm_buyer_user();

update sale_products p set buyer_user_id=b.user_id
  from auction_items i, bidders b
  where p.stage='sold' and p.buyer_user_id is null
    and i.id=p.item_id and b.id=i.leader_bidder_id;

-- Part B: what a buyer or an owner is allowed to see
create or replace function sm_my_buys(p_user uuid) returns jsonb language sql security definer set search_path=public as $fn$
select coalesce((
    select jsonb_agg(s.x order by s.x->>'sold_on' desc)
    from (
      select jsonb_build_object(
        'id', p.id, 'code', p.code, 'name', p.name,
        'photo', p.photos[1], 'vendor', v.name,
        'slug', v.slug, 'currency', v.currency,
        'inv_no', p.inv_no, 'sold_on', p.sold_on,
        'price', p.sale_price_fils, 'buyer', p.buyer_name,
        'del_status', p.del_status,
        'del_company', p.del_company,
        'del_tracking', p.del_tracking,
        'pays', coalesce((
          select jsonb_agg(jsonb_build_object(
            'no', y.no, 'amount', y.amount_fils,
            'paid_on', y.paid_on, 'method', y.method,
            'rev', y.reversal_of is not null)
            order by y.created_at)
          from sale_payments y
          where y.product_id=p.id and y.kind='buyer'
        ), '[]'::jsonb)
      ) as x
      from sale_products p
      join vendors v on v.id=p.vendor_id
      where p.stage='sold' and p.buyer_user_id=p_user
    ) s
  ), '[]'::jsonb)
$fn$;

create or replace function sm_my_owned(p_digits text) returns jsonb language sql security definer set search_path=public as $fn$
select coalesce((
    select jsonb_agg(s.x order by s.x->>'received_on' desc)
    from (
      select jsonb_build_object(
        'id', p.id, 'code', p.code, 'name', p.name,
        'photo', p.photos[1], 'vendor', v.name,
        'currency', v.currency, 'method', p.method,
        'stage', p.stage, 'received_on', p.received_on,
        'price', p.sale_price_fils, 'sold_on', p.sold_on,
        'commission', p.commission_fils,
        'listing', p.listing_fee_fils,
        'listing_when', p.listing_when,
        'listing_upfront', p.listing_upfront,
        'net', p.net_fils,
        'buyer_paid', coalesce((
          select sum(y.amount_fils) from sale_payments y
          where y.product_id=p.id and y.kind='buyer'), 0),
        'pays', coalesce((
          select jsonb_agg(jsonb_build_object(
            'no', y.no, 'amount', y.amount_fils,
            'paid_on', y.paid_on, 'method', y.method,
            'rev', y.reversal_of is not null)
            order by y.created_at)
          from sale_payments y
          where y.product_id=p.id and y.kind='owner'
        ), '[]'::jsonb)
      ) as x
      from sale_products p
      join sale_owners o on o.id=p.owner_id
      join vendors v on v.id=p.vendor_id
      where o.portal and p_digits<>''
        and regexp_replace(coalesce(o.phone,''),'\D','','g')=p_digits
        and p.stage<>'cancelled'
    ) s
  ), '[]'::jsonb)
$fn$;

create or replace function sm_my_sales(p_user uuid, p_digits text) returns jsonb language sql security definer set search_path=public as $fn$
select jsonb_build_object('buys', sm_my_buys(p_user), 'owned', sm_my_owned(p_digits))
$fn$;

revoke all on function sm_my_buys(uuid) from public, anon, authenticated;
revoke all on function sm_my_owned(text) from public, anon, authenticated;
revoke all on function sm_my_sales(uuid,text) from public, anon, authenticated;
revoke all on function sm_buyer_user() from public, anon, authenticated;
grant execute on function sm_my_buys(uuid), sm_my_owned(text), sm_my_sales(uuid,text) to service_role;

-- Part D: owner push notifications (on auction / sold), each sent once
alter table sale_products add column if not exists notified text;
update sale_products set notified=stage where stage in('auction','sold');

create or replace function sm_owner_pending(p_vendor uuid) returns jsonb language sql security definer set search_path=public as $fn$
with rs as (
  update sale_products set notified=null
  where vendor_id=p_vendor and stage in('listed','unsold') and notified is not null
), up as (
  update sale_products p set notified=p.stage
  where p.vendor_id=p_vendor and p.stage in('auction','sold') and p.owner_id is not null and p.notified is distinct from p.stage
  returning p.id,p.name,p.stage,p.sale_price_fils,p.owner_id,p.vendor_id
)
select coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'id',up.id,'name',up.name,'stage',up.stage,'price',up.sale_price_fils,'vendor',v.name,'currency',v.currency)),'[]'::jsonb)
from up join sale_owners o on o.id=up.owner_id join vendors v on v.id=up.vendor_id
join auth.users u on coalesce(o.phone,'')<>'' and regexp_replace(coalesce(u.phone,''),'\D','','g')=regexp_replace(o.phone,'\D','','g')
$fn$;
revoke all on function sm_owner_pending(uuid) from public, anon, authenticated;
grant execute on function sm_owner_pending(uuid) to service_role;
