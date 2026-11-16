-- 030 One support invoice per supporter per product: all of a supporter's supports for the winner
-- are combined (e.g. C supported A twice with +100 each -> one invoice of 200 listing both steps).

alter table sale_supports add column if not exists supporter_bidder_id uuid;
alter table sale_supports alter column contribution_id drop not null;

create table if not exists sale_support_parts(
  contribution_id uuid primary key references support_contributions(id),
  support_id uuid not null references sale_supports(id),
  vendor_id uuid not null references vendors(id),
  price_before_fils bigint not null, price_after_fils bigint not null, amount_fils bigint not null,
  created_at timestamptz not null default now());
create index if not exists sale_support_parts_sup on sale_support_parts(support_id);
alter table sale_support_parts enable row level security;
drop policy if exists ssp_read on sale_support_parts;
create policy ssp_read on sale_support_parts for select using(owns_vendor(vendor_id));
grant select on sale_support_parts to authenticated;

-- move existing rows into the new shape
update sale_supports s set supporter_bidder_id=c.supporter_id from support_contributions c where c.id=s.contribution_id and s.supporter_bidder_id is null;
insert into sale_support_parts(contribution_id,support_id,vendor_id,price_before_fils,price_after_fils,amount_fils,created_at)
  select c.id,s.id,s.vendor_id,c.price_before_fils,c.price_after_fils,c.amount_fils,c.created_at
  from sale_supports s join support_contributions c on c.id=s.contribution_id on conflict do nothing;
-- merge duplicates (same product + same supporter) into the oldest row
do $$ declare r record; keep uuid; begin
  for r in select product_id, supporter_bidder_id from sale_supports group by 1,2 having count(*)>1 loop
    select id into keep from sale_supports where product_id=r.product_id and supporter_bidder_id=r.supporter_bidder_id order by created_at limit 1;
    update sale_support_parts set support_id=keep where support_id in(select id from sale_supports where product_id=r.product_id and supporter_bidder_id=r.supporter_bidder_id and id<>keep);
    update sale_payments set support_id=keep where support_id in(select id from sale_supports where product_id=r.product_id and supporter_bidder_id=r.supporter_bidder_id and id<>keep);
    delete from sale_supports where product_id=r.product_id and supporter_bidder_id=r.supporter_bidder_id and id<>keep;
  end loop;
end $$;
update sale_supports s set amount_fils=(select sum(amount_fils) from sale_support_parts p where p.support_id=s.id), contribution_id=null;
alter table sale_supports drop constraint if exists sale_supports_contribution_id_key;
create unique index if not exists sale_supports_one_per_supporter on sale_supports(product_id, supporter_bidder_id);

create or replace function sm_sync_supports(p_product uuid) returns void
language plpgsql security definer set search_path=public as $fn$
declare sp sale_products; it auction_items; r record; sid uuid;
begin
  select * into sp from sale_products where id=p_product;
  if not found or sp.stage<>'sold' or sp.item_id is null then return; end if;
  select * into it from auction_items where id=sp.item_id;
  if it.leader_bidder_id is null then return; end if;
  for r in select sc.*, b.phone bphone, b.user_id buid from support_contributions sc join bidders b on b.id=sc.supporter_id
           where sc.item_id=sp.item_id and sc.beneficiary_id=it.leader_bidder_id and sc.status in('authorized','captured')
             and not exists(select 1 from sale_support_parts x where x.contribution_id=sc.id)
           order by sc.created_at loop
    select id into sid from sale_supports where product_id=sp.id and supporter_bidder_id=r.supporter_id;
    if sid is null then
      insert into sale_supports(vendor_id,product_id,supporter_bidder_id,supporter_name,supporter_phone,supporter_user_id,winner_name,amount_fils,inv_no)
        values(sp.vendor_id,sp.id,r.supporter_id,r.supporter_name,r.bphone,r.buid,coalesce(it.leader_name,r.beneficiary_name),r.amount_fils,sm_next(sp.vendor_id,'sp'))
        returning id into sid;
    end if;
    insert into sale_support_parts(contribution_id,support_id,vendor_id,price_before_fils,price_after_fils,amount_fils,created_at)
      values(r.id,sid,sp.vendor_id,r.price_before_fils,r.price_after_fils,r.amount_fils,r.created_at);
    update sale_supports set amount_fils=(select sum(amount_fils) from sale_support_parts where support_id=sid) where id=sid;
  end loop;
  update sale_products set support_fils=(select coalesce(sum(amount_fils),0) from sale_supports where product_id=sp.id) where id=sp.id;
end $fn$;
revoke all on function sm_sync_supports(uuid) from public, anon, authenticated;
grant execute on function sm_sync_supports(uuid) to service_role;
