-- 031 Two packages: 'full' (live auctions + automatic sales) and 'semi' (Sales Manager only: the host records sales by hand).
-- Full includes everything in semi. Manual sales work on both packages.

alter table platform_settings add column if not exists sub_month_semi_fils bigint not null default 45000 check(sub_month_semi_fils>=0);
alter table vendors add column if not exists plan_tier text not null default 'full' check(plan_tier in('full','semi'));
alter table subscriptions add column if not exists tier text not null default 'full' check(tier in('full','semi'));
alter table ziina_intents add column if not exists tier text;
alter table discount_codes add column if not exists tier text check(tier in('full','semi'));
alter table sale_products add column if not exists sale_source text not null default 'live' check(sale_source in('live','manual'));

-- plans per package
alter table sub_plans add column if not exists tier text not null default 'full' check(tier in('full','semi'));
alter table sub_plans drop constraint if exists sub_plans_pkey;
alter table sub_plans add primary key(tier, months);
insert into sub_plans(tier,months,discount_pct,active) select 'semi',months,discount_pct,active from sub_plans where tier='full' on conflict do nothing;

drop function if exists sub_quote(int,text);
create or replace function sub_quote(p_months int, p_code text, p_tier text default 'full') returns jsonb
language plpgsql security definer set search_path=public as $fn$
declare pl sub_plans; mf bigint; list bigint; after_plan bigint; total bigint; c discount_codes; off bigint:=0; cc text;
begin
  if p_tier not in('full','semi') then raise exception 'PLAN_INVALID'; end if;
  select * into pl from sub_plans where tier=p_tier and months=p_months and active;
  if not found then raise exception 'PLAN_INVALID'; end if;
  select case when p_tier='semi' then sub_month_semi_fils else sub_month_fils end into mf from platform_settings where id=1;
  list:=mf*p_months; after_plan:=round(list*(100-pl.discount_pct)/100); total:=after_plan;
  cc:=upper(btrim(coalesce(p_code,'')));
  if cc<>'' then
    select * into c from discount_codes where code=cc;
    if not found or not c.active or (c.valid_until is not null and c.valid_until<current_date)
       or (c.max_uses is not null and c.used_count>=c.max_uses)
       or (c.plan_months is not null and c.plan_months<>p_months)
       or (c.tier is not null and c.tier<>p_tier) then raise exception 'CODE_INVALID'; end if;
    off:=case when c.kind='percent' then round(after_plan*c.value/100) else round(c.value*100) end;
    total:=greatest(0, after_plan-off);
  end if;
  return jsonb_build_object('tier',p_tier,'months',p_months,'list',list,'plan_pct',pl.discount_pct,'plan_off',list-after_plan,
    'code',case when cc<>'' then cc end,'code_id',c.id,'code_off',after_plan-total,'total',total);
end $fn$;

-- Upgrading semi -> full starts at once; unused semi days are converted to full days at the price ratio.
-- Moving full -> semi starts after the current full period ends.
drop function if exists apply_subscription(uuid,int,int,bigint,bigint,text,uuid,text,uuid);
create or replace function apply_subscription(p_vendor uuid, p_months int, p_days int, p_list bigint, p_amount bigint,
  p_ref text, p_code_id uuid, p_kind text, p_actor uuid default null, p_tier text default null) returns timestamptz
language plpgsql security definer set search_path=public as $fn$
declare v vendors; st timestamptz; en timestamptz; cc text; tr text; ps platform_settings; credit interval:='0'; now_tier boolean;
begin
  if p_ref is not null and exists(select 1 from subscriptions where payment_ref=p_ref) then
    select sub_until into en from vendors where id=p_vendor; return en; end if;
  select * into v from vendors where id=p_vendor for update;
  if not found then raise exception 'VENDOR_NOT_FOUND'; end if;
  tr:=coalesce(p_tier, v.plan_tier, 'full');
  if tr not in('full','semi') then raise exception 'PLAN_INVALID'; end if;
  select * into ps from platform_settings where id=1;
  if tr='full' and v.plan_tier='semi' and v.sub_until>now() and v.status='active' then
    if ps.sub_month_fils>0 then credit:=(v.sub_until-now())*(ps.sub_month_semi_fils::numeric/ps.sub_month_fils)::float8; end if;
    st:=now();
    en:=st + make_interval(months=>coalesce(p_months,0), days=>coalesce(p_days,0)) + credit;
  else
    st:=greatest(now(), coalesce(v.sub_until, now()));
    en:=st + make_interval(months=>coalesce(p_months,0), days=>coalesce(p_days,0));
  end if;
  now_tier:= st<=now()+interval '1 minute';
  if p_amount>0 then
    insert into payments(vendor_id,kind,amount_fils,provider_ref,status,provider)
      values(p_vendor,'subscription',p_amount,p_ref,'captured','ziina') on conflict(provider_ref) do nothing;
  end if;
  if p_code_id is not null then update discount_codes set used_count=used_count+1 where id=p_code_id returning code into cc; end if;
  insert into subscriptions(vendor_id,kind,tier,months,days,starts_at,ends_at,list_fils,amount_fils,code,payment_ref)
    values(p_vendor,p_kind,tr,coalesce(p_months,0),coalesce(p_days,0),st,en,coalesce(p_list,0),coalesce(p_amount,0),cc,p_ref);
  update vendors set sub_until=en, activated_at=coalesce(activated_at,now()),
    plan_tier=case when now_tier then tr else plan_tier end,
    status=case when status in('pending_activation','expired') then 'active' else status end
    where id=p_vendor;
  perform audit(p_vendor,p_actor,'subscription.'||p_kind,'vendor',p_vendor,
    jsonb_build_object('tier',tr,'months',p_months,'days',p_days,'amount',p_amount,'until',en,'code',cc));
  return en;
end $fn$;

-- every minute: lock ended subscriptions and switch the package when a queued period starts
create or replace function expire_subscriptions() returns int
language plpgsql security definer set search_path=public as $fn$
declare n int;
begin
  update vendors v set plan_tier=x.t from (
      select v2.id, (select s.tier from subscriptions s where s.vendor_id=v2.id and s.starts_at<=now() and s.ends_at>now() order by s.starts_at desc limit 1) t
      from vendors v2 where v2.status='active') x
    where x.id=v.id and x.t is not null and x.t<>v.plan_tier;
  update vendors set status='expired' where status='active' and sub_until is not null and sub_until<now();
  get diagnostics n=row_count; return n;
end $fn$;

create or replace function start_trial(p_vendor uuid, p_actor uuid default null) returns timestamptz
language plpgsql security definer set search_path=public as $fn$
declare td int;
begin
  select trial_days into td from platform_settings where id=1;
  if coalesce(td,0)<=0 then raise exception 'TRIAL_OFF'; end if;
  perform 1 from vendors where id=p_vendor for update;
  if exists(select 1 from subscriptions where vendor_id=p_vendor) then raise exception 'TRIAL_USED'; end if;
  return apply_subscription(p_vendor,0,td,0,0,'trial-'||p_vendor::text,null,'trial',p_actor,'full');
end $fn$;

-- live features are for the full package only (checked in the database, not just on screen)
create or replace function plan_live_guard() returns trigger language plpgsql security definer set search_path=public as $fn$
begin
  if exists(select 1 from vendors where id=new.vendor_id and plan_tier='semi') then raise exception 'PLAN_SEMI'; end if;
  return new;
end $fn$;
drop trigger if exists t_plan_guard_session on auctions;
create trigger t_plan_guard_session before insert on auctions for each row when (new.status='live') execute function plan_live_guard();
drop trigger if exists t_plan_guard_item on auction_items;
create trigger t_plan_guard_item before update of status on auction_items for each row
  when (new.status='live' and old.status is distinct from 'live') execute function plan_live_guard();

-- record a sale by hand (works on both packages): buyer, price and any supporters with their own amounts
create or replace function sm_manual_sale(p_user uuid, p_product uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path=public as $fn$
declare vid uuid; sp sale_products; r sales_rules; c bigint:=0; ck text; net bigint; inv text;
  price bigint:=nullif(p->>'price_fils','')::bigint; bn text:=btrim(coalesce(p->>'buyer_name','')); bph text:=nullif(btrim(coalesce(p->>'buyer_phone','')),'');
  sd date:=coalesce(nullif(p->>'date','')::date,(now() at time zone 'Asia/Dubai')::date);
  x jsonb; tot bigint:=0; sn text; sa bigint; sph text; buid uuid; suid uuid;
begin
  vid:=sm_vendor(p_user);
  select * into sp from sale_products where id=p_product and vendor_id=vid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if sp.stage not in('listed','unsold') then raise exception 'NOT_SELLABLE'; end if;
  if bn='' or price is null or price<=0 then raise exception 'BAD_INPUT'; end if;
  for x in select * from jsonb_array_elements(coalesce(p->'supporters','[]'::jsonb)) loop
    sa:=nullif(x->>'amount_fils','')::bigint;
    if btrim(coalesce(x->>'name',''))='' or sa is null or sa<=0 then raise exception 'BAD_SUPPORT'; end if;
    tot:=tot+sa;
  end loop;
  if tot>price then raise exception 'SUPPORT_OVER_PRICE'; end if;
  r:=sm_rules(vid);
  if sp.owner_id is not null and not sp.legacy then select amount,kind into c,ck from sm_commission(r,sp.method,price); end if;
  net:=case when sp.owner_id is null then 0 else greatest(0,price-c-case when sp.listing_upfront then 0 else sp.listing_fee_fils end) end;
  inv:=sm_next(vid,'inv');
  if bph is not null and length(regexp_replace(bph,'\D','','g'))>=8 then
    select id into buid from auth.users where regexp_replace(coalesce(phone,''),'\D','','g')=regexp_replace(bph,'\D','','g') limit 1;
  end if;
  update sale_products set stage='sold',sale_source='manual',sale_price_fils=price,buyer_name=bn,buyer_phone=bph,buyer_user_id=buid,
    sold_on=sd,commission_fils=c,commission_kind=ck,commission_pct=case when ck='percent' then r.order_pct end,
    net_fils=net,inv_no=inv,rules_sale=to_jsonb(r),confirmed_at=now() where id=sp.id;
  if sp.item_id is not null then
    update auction_items set status='sold',current_price_fils=price,leader_name=bn,closed_at=coalesce(closed_at,now()) where id=sp.item_id and status in('queued','paused','unsold');
  end if;
  for x in select * from jsonb_array_elements(coalesce(p->'supporters','[]'::jsonb)) loop
    sn:=btrim(x->>'name'); sa:=(x->>'amount_fils')::bigint; sph:=nullif(btrim(coalesce(x->>'phone','')),''); suid:=null;
    if sph is not null and length(regexp_replace(sph,'\D','','g'))>=8 then
      select id into suid from auth.users where regexp_replace(coalesce(phone,''),'\D','','g')=regexp_replace(sph,'\D','','g') limit 1;
    end if;
    insert into sale_supports(vendor_id,product_id,supporter_name,supporter_phone,supporter_user_id,winner_name,amount_fils,inv_no)
      values(vid,sp.id,sn,sph,suid,bn,sa,sm_next(vid,'sp'));
  end loop;
  update sale_products set support_fils=tot where id=sp.id;
  perform sm_log(vid,sp.id,p_user,'sold',jsonb_build_object('price',price,'buyer',bn,'commission',c,'inv_no',inv,'manual',true,'supporters',tot));
  return jsonb_build_object('inv_no',inv,'buyer_user_id',buid);
end $fn$;

revoke all on function sub_quote(int,text,text) from public, anon, authenticated;
revoke all on function apply_subscription(uuid,int,int,bigint,bigint,text,uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function sm_manual_sale(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function plan_live_guard() from public, anon, authenticated;
grant execute on function sub_quote(int,text,text), apply_subscription(uuid,int,int,bigint,bigint,text,uuid,text,uuid,text), sm_manual_sale(uuid,uuid,jsonb) to service_role;
