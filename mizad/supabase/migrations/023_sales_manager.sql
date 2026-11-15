-- 023: My Sales becomes a sales management and accounting system.
-- Safe to run more than once. All money is integer hundredths of the host's currency.
-- Browsers can only READ these tables; every change goes through the functions below (called by the server).

-- ===== tables =====
create table if not exists sales_rules(
  vendor_id uuid primary key references vendors(id),
  order_listing_fils bigint not null default 10000 check(order_listing_fils>=0),
  order_fixed_fils bigint not null default 10000 check(order_fixed_fils>=0),
  order_pct numeric(5,2) not null default 5 check(order_pct>=0 and order_pct<=100),
  order_threshold_fils bigint not null default 200000 check(order_threshold_fils>=0),
  at_threshold text not null default 'fixed' check(at_threshold in('fixed','percent')),
  regular_listing_fils bigint not null default 0 check(regular_listing_fils>=0),
  regular_commission_fils bigint not null default 5000 check(regular_commission_fils>=0),
  listing_when text not null default 'registration' check(listing_when in('registration','sold')),
  pay_methods text[] not null default array['Cash','Bank transfer']::text[],
  updated_at timestamptz not null default now());

create table if not exists sales_rules_log(id bigserial primary key, vendor_id uuid not null references vendors(id),
  actor_id uuid, changes jsonb not null, created_at timestamptz not null default now());

create table if not exists sale_owners(id uuid primary key default gen_random_uuid(), vendor_id uuid not null references vendors(id),
  name text not null, phone text, created_at timestamptz not null default now());
create unique index if not exists sale_owners_phone_uq on sale_owners(vendor_id,phone) where phone is not null;

create table if not exists sale_counters(vendor_id uuid not null references vendors(id), kind text not null, n int not null default 0, primary key(vendor_id,kind));

create table if not exists sale_products(id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id), code text not null,
  item_id uuid references auction_items(id) on delete set null,
  owner_id uuid references sale_owners(id),
  name text not null, category text, description text, photos text[] not null default '{}'::text[],
  asked_fils bigint check(asked_fils is null or asked_fils>=0),
  method text not null check(method in('order','regular')),
  start_fils bigint, inc_fils bigint,
  received_on date not null default current_date, notes text,
  stage text not null default 'listed' check(stage in('listed','auction','sold','unsold','cancelled')),
  listing_fee_fils bigint not null default 0, listing_when text not null default 'registration', listing_upfront boolean not null default false,
  rules_intake jsonb, rr_no text not null, legacy boolean not null default false,
  sale_price_fils bigint, buyer_name text, buyer_phone text, sold_on date,
  commission_fils bigint, commission_kind text, commission_pct numeric(5,2), net_fils bigint, inv_no text, rules_sale jsonb, confirmed_at timestamptz,
  del_status text not null default 'none' check(del_status in('none','pickup','picked','transit','delivered','failed')),
  del_address text, del_company text, del_fee_fils bigint not null default 0, del_payer text not null default 'buyer' check(del_payer in('buyer','seller')), del_tracking text,
  created_at timestamptz not null default now(), unique(vendor_id,code));
create index if not exists sale_products_vendor_idx on sale_products(vendor_id,stage);
create unique index if not exists sale_products_item_uq on sale_products(item_id) where item_id is not null;

create table if not exists sale_payments(id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id), product_id uuid not null references sale_products(id),
  kind text not null check(kind in('buyer','owner')), no text not null, amount_fils bigint not null,
  method text, paid_on date not null default current_date, ref text, notes text, receipt_path text,
  reversed boolean not null default false, reversal_of uuid references sale_payments(id),
  created_at timestamptz not null default now());
create index if not exists sale_payments_product_idx on sale_payments(product_id);

create table if not exists sale_log(id bigserial primary key, vendor_id uuid not null references vendors(id),
  product_id uuid not null references sale_products(id), actor_id uuid, action text not null, data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now());
create index if not exists sale_log_product_idx on sale_log(product_id,id);

-- read-only for the host who owns them
do $do$ declare tb text; begin
  foreach tb in array array['sales_rules','sales_rules_log','sale_owners','sale_counters','sale_products','sale_payments','sale_log'] loop
    execute format('alter table %I enable row level security', tb);
    execute format('revoke all on %I from anon, authenticated', tb);
    execute format('grant select on %I to authenticated', tb);
    execute format('grant all on %I to service_role', tb);
    execute format('drop policy if exists %I on %I', tb||'_read', tb);
    execute format('create policy %I on %I for select using(owns_vendor(vendor_id))', tb||'_read', tb);
  end loop; end $do$;
grant usage, select on all sequences in schema public to service_role;

-- private storage for payment receipt photos (folder = vendor id)
insert into storage.buckets(id,name,public) values('receipts','receipts',false) on conflict do nothing;
drop policy if exists rcp_ins on storage.objects; drop policy if exists rcp_sel on storage.objects;
create policy rcp_ins on storage.objects for insert to authenticated with check(bucket_id='receipts' and owns_vendor(((storage.foldername(name))[1])::uuid));
create policy rcp_sel on storage.objects for select to authenticated using(bucket_id='receipts' and owns_vendor(((storage.foldername(name))[1])::uuid));

-- ===== helpers =====
create or replace function sm_vendor(p_user uuid) returns uuid language plpgsql security definer set search_path=public as $fn$
declare vid uuid;
begin
  select id into vid from vendors where owner_id=p_user and status='active';
  if vid is null then raise exception 'FORBIDDEN'; end if;
  return vid;
end $fn$;

create or replace function sm_next(p_vendor uuid,p_kind text) returns text language plpgsql security definer set search_path=public as $fn$
declare x int;
begin
  insert into sale_counters(vendor_id,kind,n) values(p_vendor,p_kind,1)
    on conflict(vendor_id,kind) do update set n=sale_counters.n+1 returning n into x;
  return upper(p_kind)||'-'||lpad(x::text,4,'0');
end $fn$;

create or replace function sm_rules(p_vendor uuid) returns sales_rules language plpgsql security definer set search_path=public as $fn$
declare r sales_rules;
begin
  insert into sales_rules(vendor_id) values(p_vendor) on conflict do nothing;
  select * into r from sales_rules where vendor_id=p_vendor;
  return r;
end $fn$;

create or replace function sm_log(p_vendor uuid,p_product uuid,p_actor uuid,p_action text,p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path=public as $fn$
  insert into sale_log(vendor_id,product_id,actor_id,action,data) values(p_vendor,p_product,p_actor,p_action,coalesce(p_data,'{}'::jsonb)) $fn$;

-- the one place commission is calculated
create or replace function sm_commission(r sales_rules,p_method text,p_price bigint,out amount bigint,out kind text) language plpgsql immutable as $fn$
begin
  if p_method='regular' then amount:=r.regular_commission_fils; kind:='regular';
  elsif p_price>r.order_threshold_fils or (p_price=r.order_threshold_fils and r.at_threshold='percent') then
    amount:=round(p_price*r.order_pct/100.0)::bigint; kind:='percent';
  else amount:=r.order_fixed_fils; kind:='fixed'; end if;
end $fn$;

-- ===== receive a product: saves the record AND puts it in the Products queue under the right auction type =====
create or replace function sm_receive(p_user uuid,p jsonb) returns jsonb language plpgsql security definer set search_path=public as $fn$
declare vid uuid; r sales_rules; oid uuid; ph text; onm text; fee bigint:=0; cd text; rr text; pid uuid; iid uuid;
  m text:=p->>'method'; own boolean:=coalesce((p->>'own')::boolean,false); sp bigint:=(p->>'start_fils')::bigint; inc bigint:=(p->>'inc_fils')::bigint;
  nm text:=btrim(coalesce(p->>'name','')); photos text[]; asked bigint:=nullif(p->>'asked_fils','')::bigint; up boolean:=coalesce((p->>'upfront')::boolean,false);
begin
  vid:=sm_vendor(p_user); r:=sm_rules(vid);
  if m is null or m not in('order','regular') or nm='' then raise exception 'BAD_INPUT'; end if;
  if sp is null or sp<=0 or inc is null or inc<200 then raise exception 'BAD_PRICE'; end if;
  if not own then
    ph:=btrim(coalesce(p->>'owner_phone','')); onm:=btrim(coalesce(p->>'owner_name',''));
    if length(regexp_replace(ph,'\D','','g'))<8 or onm='' then raise exception 'OWNER_REQUIRED'; end if;
    select id into oid from sale_owners where vendor_id=vid and phone=ph;
    if oid is null then insert into sale_owners(vendor_id,name,phone) values(vid,onm,ph) returning id into oid;
    else update sale_owners set name=onm where id=oid; end if;
    fee:=case when m='order' then r.order_listing_fils else r.regular_listing_fils end;
  end if;
  loop cd:=sm_next(vid,'mb'); exit when not exists(select 1 from auction_items where vendor_id=vid and ref_code=cd) and not exists(select 1 from sale_products where vendor_id=vid and code=cd); end loop;
  rr:=sm_next(vid,'rr');
  select coalesce(array_agg(x),'{}'::text[]) into photos from jsonb_array_elements_text(coalesce(p->'photos','[]'::jsonb)) x;
  insert into auction_items(vendor_id,name,description,image_url,ref_code,position,start_price_fils,increment_fils,auction_type)
    values(vid,nm,nullif(btrim(coalesce(p->>'description','')),''),photos[1],cd,(select coalesce(max(position),0)+1 from auction_items where vendor_id=vid),
      case when m='order' then 100 else sp end, case when m='order' then 200 else inc end, case when m='order' then 'custom' else 'standard' end)
    returning id into iid;
  if m='order' then insert into item_secrets(item_id,vendor_id,start_price_fils,increment_fils) values(iid,vid,sp,inc); end if;
  insert into item_private(item_id,vendor_id,owner_name,owner_phone,asked_price_fils,category)
    values(iid,vid,onm,ph,asked,nullif(btrim(coalesce(p->>'category','')),''));
  insert into sale_products(vendor_id,code,item_id,owner_id,name,category,description,photos,asked_fils,method,start_fils,inc_fils,received_on,notes,stage,
      listing_fee_fils,listing_when,listing_upfront,rules_intake,rr_no)
    values(vid,cd,iid,oid,nm,nullif(btrim(coalesce(p->>'category','')),''),nullif(btrim(coalesce(p->>'description','')),''),photos,asked,m,sp,inc,
      coalesce(nullif(p->>'received_on','')::date,(now() at time zone 'Asia/Dubai')::date),nullif(btrim(coalesce(p->>'notes','')),''),'listed',
      fee,r.listing_when,(up and fee>0),to_jsonb(r),rr)
    returning id into pid;
  perform sm_log(vid,pid,p_user,'received',jsonb_build_object('rr_no',rr,'owner',onm,'listing_fee',fee,'upfront',(up and fee>0)));
  perform sm_log(vid,pid,p_user,'listed',jsonb_build_object('method',m));
  return jsonb_build_object('id',pid,'code',cd,'rr_no',rr);
end $fn$;

-- ===== follow the live auction: status changes on the auction item update the sales record by themselves =====
create or replace function sm_item_sync() returns trigger language plpgsql security definer set search_path=public as $fn$
declare sp sale_products; r sales_rules; c bigint:=0; ck text; bph text; inv text; net bigint;
begin
  if new.status is not distinct from old.status then return null; end if;
  begin
    select * into sp from sale_products where item_id=new.id for update;
    if not found or sp.stage in('sold','cancelled') then return null; end if;
    if new.status in('live','paused') then
      if sp.stage<>'auction' then update sale_products set stage='auction' where id=sp.id; perform sm_log(sp.vendor_id,sp.id,null,'auction'); end if;
    elsif new.status='queued' then
      update sale_products set stage='listed' where id=sp.id and stage<>'listed';
    elsif new.status='unsold' then
      update sale_products set stage='unsold' where id=sp.id; perform sm_log(sp.vendor_id,sp.id,null,'unsold');
    elsif new.status='sold' then
      r:=sm_rules(sp.vendor_id);
      if sp.owner_id is not null and not sp.legacy then select amount,kind into c,ck from sm_commission(r,sp.method,new.current_price_fils); end if;
      net:=case when sp.owner_id is null then 0 else greatest(0,new.current_price_fils-c-case when sp.listing_upfront then 0 else sp.listing_fee_fils end) end;
      select phone into bph from bidders where id=new.leader_bidder_id;
      inv:=sm_next(sp.vendor_id,'inv');
      update sale_products set stage='sold',sale_price_fils=new.current_price_fils,buyer_name=new.leader_name,buyer_phone=bph,
        sold_on=(now() at time zone 'Asia/Dubai')::date,commission_fils=c,commission_kind=ck,commission_pct=case when ck='percent' then r.order_pct end,
        net_fils=net,inv_no=inv,rules_sale=to_jsonb(r) where id=sp.id;
      perform sm_log(sp.vendor_id,sp.id,null,'sold',jsonb_build_object('price',new.current_price_fils,'buyer',new.leader_name,'commission',c,'inv_no',inv));
    end if;
  exception when others then -- never block the live auction because of bookkeeping
    insert into audit_logs(vendor_id,action,entity,entity_id,data) values(new.vendor_id,'sales.sync_error','item',new.id,jsonb_build_object('error',sqlerrm));
  end;
  return null;
end $fn$;
drop trigger if exists t_sm_item_sync on auction_items;
create trigger t_sm_item_sync after update of status on auction_items for each row execute function sm_item_sync();

-- ===== payments: buyer collections and owner settlements (partial payments allowed) =====
create or replace function sm_pay(p_user uuid,p_product uuid,p_kind text,p_amount bigint,p_method text,p_date date,p_ref text,p_notes text,p_receipt text) returns text
language plpgsql security definer set search_path=public as $fn$
declare vid uuid; sp sale_products; bp bigint; op bigint; no_ text;
begin
  vid:=sm_vendor(p_user);
  select * into sp from sale_products where id=p_product and vendor_id=vid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if sp.stage<>'sold' then raise exception 'NOT_SOLD'; end if;
  if p_kind not in('buyer','owner') then raise exception 'BAD_INPUT'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'BAD_AMOUNT'; end if;
  select coalesce(sum(amount_fils) filter(where kind='buyer'),0),coalesce(sum(amount_fils) filter(where kind='owner'),0) into bp,op from sale_payments where product_id=sp.id;
  if p_kind='buyer' then
    if p_amount>sp.sale_price_fils-bp then raise exception 'OVER_DUE'; end if;
  else
    if bp<sp.sale_price_fils then raise exception 'BUYER_NOT_PAID'; end if;
    if p_amount>sp.net_fils-op then raise exception 'OVER_DUE'; end if;
  end if;
  no_:=sm_next(vid,case when p_kind='buyer' then 'rc' else 'st' end);
  insert into sale_payments(vendor_id,product_id,kind,no,amount_fils,method,paid_on,ref,notes,receipt_path)
    values(vid,sp.id,p_kind,no_,p_amount,nullif(btrim(coalesce(p_method,'')),''),coalesce(p_date,(now() at time zone 'Asia/Dubai')::date),
      nullif(btrim(coalesce(p_ref,'')),''),nullif(btrim(coalesce(p_notes,'')),''),nullif(p_receipt,''));
  perform sm_log(vid,sp.id,p_user,case when p_kind='buyer' then 'buyer_paid' else 'owner_paid' end,jsonb_build_object('no',no_,'amount',p_amount,'method',p_method));
  return no_;
end $fn$;

-- a wrong entry is never deleted: a reversal entry is added and the reason is kept
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
  if pm.kind='buyer' then
    select coalesce(sum(amount_fils),0) into op from sale_payments where product_id=pm.product_id and kind='owner';
    if op>0 then raise exception 'OWNER_ALREADY_PAID'; end if;
  end if;
  no_:=sm_next(vid,case when pm.kind='buyer' then 'rc' else 'st' end);
  update sale_payments set reversed=true where id=pm.id;
  insert into sale_payments(vendor_id,product_id,kind,no,amount_fils,method,paid_on,ref,notes,reversal_of)
    values(vid,pm.product_id,pm.kind,no_,-pm.amount_fils,pm.method,(now() at time zone 'Asia/Dubai')::date,pm.no,btrim(p_reason),pm.id);
  perform sm_log(vid,pm.product_id,p_user,'reversed',jsonb_build_object('no',pm.no,'amount',pm.amount_fils,'reason',btrim(p_reason),'kind',pm.kind));
  return no_;
end $fn$;

create or replace function sm_delivery(p_user uuid,p_product uuid,p jsonb) returns void
language plpgsql security definer set search_path=public as $fn$
declare vid uuid; sp sale_products; st text:=p->>'status'; fee bigint:=coalesce(nullif(p->>'fee_fils','')::bigint,0);
begin
  vid:=sm_vendor(p_user);
  select * into sp from sale_products where id=p_product and vendor_id=vid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if sp.stage<>'sold' then raise exception 'NOT_SOLD'; end if;
  if st is null or st not in('none','pickup','picked','transit','delivered','failed') or fee<0 or coalesce(p->>'payer','buyer') not in('buyer','seller') then raise exception 'BAD_INPUT'; end if;
  update sale_products set del_status=st,del_address=nullif(btrim(coalesce(p->>'address','')),''),del_company=nullif(btrim(coalesce(p->>'company','')),''),
    del_tracking=nullif(btrim(coalesce(p->>'tracking','')),''),del_fee_fils=fee,del_payer=coalesce(p->>'payer','buyer') where id=sp.id;
  perform sm_log(vid,sp.id,p_user,'delivery',jsonb_build_object('status',st,'company',p->>'company','tracking',p->>'tracking','fee',fee));
end $fn$;

-- confirm (after an automatic sale), cancel, put back in the queue, mark the listing fee as collected
create or replace function sm_action(p_user uuid,p_product uuid,p_action text,p jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path=public as $fn$
declare vid uuid; sp sale_products; it auction_items; sec item_secrets; iid uuid; has boolean;
begin
  vid:=sm_vendor(p_user);
  select * into sp from sale_products where id=p_product and vendor_id=vid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_action='confirm' then
    if sp.stage<>'sold' then raise exception 'NOT_SOLD'; end if;
    update sale_products set confirmed_at=coalesce(confirmed_at,now()),del_address=coalesce(nullif(btrim(coalesce(p->>'address','')),''),del_address),
      buyer_phone=coalesce(nullif(btrim(coalesce(p->>'buyer_phone','')),''),buyer_phone) where id=sp.id;
    perform sm_log(vid,sp.id,p_user,'confirmed');
  elsif p_action='listing_paid' then
    if sp.stage='sold' or sp.listing_upfront or sp.listing_fee_fils<=0 then raise exception 'BAD_ACTION'; end if;
    update sale_products set listing_upfront=true where id=sp.id;
    perform sm_log(vid,sp.id,p_user,'listing_paid',jsonb_build_object('amount',sp.listing_fee_fils));
  elsif p_action='cancel' then
    if sp.stage in('sold','cancelled') then raise exception 'BAD_ACTION'; end if;
    select * into it from auction_items where id=sp.item_id for update; has:=found;
    if has and it.status in('live','paused') then raise exception 'IN_AUCTION'; end if;
    update sale_products set stage='cancelled' where id=sp.id;
    if has and it.status='queued' and it.bid_count=0 then delete from auction_items where id=it.id; end if;
    perform sm_log(vid,sp.id,p_user,'cancelled',jsonb_build_object('reason',p->>'reason'));
  elsif p_action='relist' then
    if sp.stage<>'unsold' then raise exception 'BAD_ACTION'; end if;
    if sp.item_id is not null then
      select * into sec from item_secrets where item_id=sp.item_id;
      update auction_items set ref_code=null where id=sp.item_id;
    end if;
    insert into auction_items(vendor_id,name,description,image_url,ref_code,position,start_price_fils,increment_fils,auction_type)
      values(vid,sp.name,sp.description,sp.photos[1],sp.code,(select coalesce(max(position),0)+1 from auction_items where vendor_id=vid),
        case when sp.method='order' then 100 else coalesce(sp.start_fils,100) end, case when sp.method='order' then 200 else coalesce(sp.inc_fils,200) end,
        case when sp.method='order' then 'custom' else 'standard' end) returning id into iid;
    if sp.method='order' then insert into item_secrets(item_id,vendor_id,start_price_fils,increment_fils) values(iid,vid,coalesce(sp.start_fils,sec.start_price_fils,100),coalesce(sp.inc_fils,sec.increment_fils,200)); end if;
    insert into item_private(item_id,vendor_id,owner_name,owner_phone,asked_price_fils,category)
      select iid,vid,o.name,o.phone,sp.asked_fils,sp.category from (select 1) x left join sale_owners o on o.id=sp.owner_id;
    update sale_products set item_id=iid,stage='listed' where id=sp.id;
    perform sm_log(vid,sp.id,p_user,'relisted');
  else raise exception 'BAD_ACTION'; end if;
end $fn$;

create or replace function sm_rules_save(p_user uuid,p jsonb) returns void language plpgsql security definer set search_path=public as $fn$
declare vid uuid; o sales_rules; n sales_rules; ch jsonb:='{}'::jsonb; k text; pm text[];
begin
  vid:=sm_vendor(p_user); o:=sm_rules(vid);
  if p ? 'pay_methods' then select coalesce(array_agg(btrim(x)) filter(where btrim(x)<>''),array['Cash']) into pm from jsonb_array_elements_text(p->'pay_methods') x;
  else pm:=o.pay_methods; end if;
  update sales_rules set
    order_listing_fils=coalesce((p->>'order_listing_fils')::bigint,order_listing_fils), order_fixed_fils=coalesce((p->>'order_fixed_fils')::bigint,order_fixed_fils),
    order_pct=coalesce((p->>'order_pct')::numeric,order_pct), order_threshold_fils=coalesce((p->>'order_threshold_fils')::bigint,order_threshold_fils),
    at_threshold=coalesce(p->>'at_threshold',at_threshold), regular_listing_fils=coalesce((p->>'regular_listing_fils')::bigint,regular_listing_fils),
    regular_commission_fils=coalesce((p->>'regular_commission_fils')::bigint,regular_commission_fils), listing_when=coalesce(p->>'listing_when',listing_when),
    pay_methods=pm, updated_at=now() where vendor_id=vid returning * into n;
  for k in select key from jsonb_each(to_jsonb(n)) where key not in('vendor_id','updated_at') loop
    if to_jsonb(o)->k is distinct from to_jsonb(n)->k then ch:=ch||jsonb_build_object(k,jsonb_build_array(to_jsonb(o)->k,to_jsonb(n)->k)); end if;
  end loop;
  if ch<>'{}'::jsonb then insert into sales_rules_log(vendor_id,actor_id,changes) values(vid,p_user,ch); end if;
end $fn$;

do $do$ declare f text; begin
  foreach f in array array['sm_vendor(uuid)','sm_next(uuid,text)','sm_rules(uuid)','sm_log(uuid,uuid,uuid,text,jsonb)','sm_receive(uuid,jsonb)','sm_item_sync()',
    'sm_pay(uuid,uuid,text,bigint,text,date,text,text,text)','sm_reverse(uuid,uuid,text)','sm_delivery(uuid,uuid,jsonb)','sm_action(uuid,uuid,text,jsonb)','sm_rules_save(uuid,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop; end $do$;

-- ===== bring existing products into the new system (runs once; old sales keep zero commission because the rules did not exist then) =====
do $do$
declare i record; pv item_private; oid uuid; cd text; pid uuid; st text; bph text; hasowner boolean; mk text[];
begin
  for i in select a.* from auction_items a where not exists(select 1 from sale_products s where s.item_id=a.id) order by a.created_at loop
    select * into pv from item_private where item_id=i.id;
    oid:=null; mk:=coalesce(pv.marks,array['pending']);
    hasowner:=coalesce(btrim(pv.owner_name),'')<>'' or coalesce(btrim(pv.owner_phone),'')<>'';
    if hasowner then
      if coalesce(btrim(pv.owner_phone),'')<>'' then
        select id into oid from sale_owners where vendor_id=i.vendor_id and phone=btrim(pv.owner_phone);
        if oid is null then insert into sale_owners(vendor_id,name,phone) values(i.vendor_id,coalesce(nullif(btrim(pv.owner_name),''),btrim(pv.owner_phone)),btrim(pv.owner_phone)) returning id into oid; end if;
      else
        select id into oid from sale_owners where vendor_id=i.vendor_id and phone is null and name=btrim(pv.owner_name);
        if oid is null then insert into sale_owners(vendor_id,name) values(i.vendor_id,btrim(pv.owner_name)) returning id into oid; end if;
      end if;
    end if;
    cd:=i.ref_code;
    if cd is null or exists(select 1 from sale_products where vendor_id=i.vendor_id and code=cd) then
      loop cd:=sm_next(i.vendor_id,'mb'); exit when not exists(select 1 from auction_items where vendor_id=i.vendor_id and ref_code=cd) and not exists(select 1 from sale_products where vendor_id=i.vendor_id and code=cd); end loop;
    end if;
    st:=case i.status when 'queued' then 'listed' when 'live' then 'auction' when 'paused' then 'auction' else i.status end;
    select phone into bph from bidders where id=i.leader_bidder_id;
    insert into sale_products(vendor_id,code,item_id,owner_id,name,category,description,photos,asked_fils,method,start_fils,inc_fils,received_on,stage,rr_no,legacy,
        sale_price_fils,buyer_name,buyer_phone,sold_on,commission_fils,net_fils,inv_no,confirmed_at,del_status,created_at)
      values(i.vendor_id,cd,i.id,oid,i.name,pv.category,i.description,case when i.image_url is null then '{}'::text[] else array[i.image_url] end,pv.asked_price_fils,
        case when i.auction_type='custom' then 'order' else 'regular' end,
        coalesce((select start_price_fils from item_secrets where item_id=i.id),i.start_price_fils),coalesce((select increment_fils from item_secrets where item_id=i.id),i.increment_fils),
        (i.created_at at time zone 'Asia/Dubai')::date,st,sm_next(i.vendor_id,'rr'),true,
        case when st='sold' then i.current_price_fils end,case when st='sold' then i.leader_name end,case when st='sold' then bph end,
        case when st='sold' then (coalesce(i.closed_at,i.created_at) at time zone 'Asia/Dubai')::date end,case when st='sold' then 0 end,
        case when st='sold' then (case when oid is null then 0 else i.current_price_fils end) end,case when st='sold' then sm_next(i.vendor_id,'inv') end,
        case when st='sold' then now() end,case when st='sold' and 'completed'=any(mk) then 'delivered' else 'none' end,i.created_at)
      returning id into pid;
    perform sm_log(i.vendor_id,pid,null,'migrated');
    if st='sold' and (mk && array['winner_paid','owner_paid','completed']) then
      insert into sale_payments(vendor_id,product_id,kind,no,amount_fils,notes) values(i.vendor_id,pid,'buyer',sm_next(i.vendor_id,'rc'),i.current_price_fils,'migrated');
      if oid is not null and (mk && array['owner_paid','completed']) and i.current_price_fils>0 then
        insert into sale_payments(vendor_id,product_id,kind,no,amount_fils,notes) values(i.vendor_id,pid,'owner',sm_next(i.vendor_id,'st'),i.current_price_fils,'migrated');
      end if;
    end if;
  end loop;
end $do$;
