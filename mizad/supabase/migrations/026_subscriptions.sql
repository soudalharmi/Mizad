-- 026 Host subscriptions (replaces the one-time activation fee).
-- Bidders stay free. Per-product service fee and minimum session fee are unchanged.
-- Prices, plan discounts, trial length and discount codes are all edited from the admin page.

-- settings: monthly price (AED fils) and free-trial length for new hosts
alter table platform_settings add column if not exists sub_month_fils bigint not null default 50000 check(sub_month_fils>=0);
alter table platform_settings add column if not exists trial_days int not null default 7 check(trial_days between 0 and 365);

-- plans: 1/3/6/12 months with a discount each (admin can edit or switch off)
create table if not exists sub_plans(
  months int primary key check(months between 1 and 36),
  discount_pct numeric(5,2) not null default 0 check(discount_pct between 0 and 100),
  active boolean not null default true);
insert into sub_plans(months,discount_pct) values(1,0),(3,10),(6,15),(12,20) on conflict do nothing;

-- discount codes: many codes, each percent or fixed AED, optional limits
create table if not exists discount_codes(
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[A-Z0-9-]{3,24}$'),
  kind text not null default 'percent' check(kind in('percent','fixed')),
  value numeric(12,2) not null check(value>0),
  max_uses int check(max_uses>0),
  used_count int not null default 0,
  valid_until date,
  plan_months int,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  check(kind<>'percent' or value<=100));

-- every subscription period a host gets (paid, trial, given by admin, or free via a 100% code)
create table if not exists subscriptions(
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id),
  kind text not null default 'paid' check(kind in('paid','trial','admin','free')),
  months int not null default 0, days int not null default 0,
  starts_at timestamptz not null, ends_at timestamptz not null,
  list_fils bigint not null default 0, amount_fils bigint not null default 0,
  code text, payment_ref text unique,
  created_at timestamptz not null default now());
create index if not exists subscriptions_vendor on subscriptions(vendor_id, ends_at desc);

alter table vendors add column if not exists sub_until timestamptz;
alter table vendors drop constraint if exists vendors_status_check;
alter table vendors add constraint vendors_status_check check(status in('pending_activation','active','suspended','expired'));

alter table ziina_intents add column if not exists months int;
alter table ziina_intents add column if not exists code_id uuid;
alter table ziina_intents add column if not exists list_fils bigint;
alter table ziina_intents drop constraint if exists ziina_intents_kind_check;
alter table ziina_intents add constraint ziina_intents_kind_check check(kind in('activation','invoice','subscription'));
alter table payments drop constraint if exists payments_kind_check;
alter table payments add constraint payments_kind_check check(kind in('support','activation','invoice','subscription'));

alter table sub_plans enable row level security;
alter table discount_codes enable row level security;
alter table subscriptions enable row level security;
drop policy if exists sp_read on sub_plans;
create policy sp_read on sub_plans for select using(true);
drop policy if exists subs_read on subscriptions;
create policy subs_read on subscriptions for select using(owns_vendor(vendor_id) or is_admin());
grant select on sub_plans to anon, authenticated;
grant select on subscriptions to authenticated;
revoke all on discount_codes from anon, authenticated;

-- Price for a plan, optionally with a discount code. Raises CODE_INVALID / PLAN_INVALID.
create or replace function sub_quote(p_months int, p_code text) returns jsonb
language plpgsql security definer set search_path=public as $fn$
declare pl sub_plans; mf bigint; list bigint; after_plan bigint; total bigint; c discount_codes; off bigint:=0; cc text;
begin
  select * into pl from sub_plans where months=p_months and active;
  if not found then raise exception 'PLAN_INVALID'; end if;
  select sub_month_fils into mf from platform_settings where id=1;
  list:=mf*p_months;
  after_plan:=round(list*(100-pl.discount_pct)/100);
  total:=after_plan;
  cc:=upper(btrim(coalesce(p_code,'')));
  if cc<>'' then
    select * into c from discount_codes where code=cc;
    if not found or not c.active
       or (c.valid_until is not null and c.valid_until<current_date)
       or (c.max_uses is not null and c.used_count>=c.max_uses)
       or (c.plan_months is not null and c.plan_months<>p_months) then
      raise exception 'CODE_INVALID';
    end if;
    off:=case when c.kind='percent' then round(after_plan*c.value/100) else round(c.value*100) end;
    total:=greatest(0, after_plan-off);
  end if;
  return jsonb_build_object('months',p_months,'list',list,'plan_pct',pl.discount_pct,'plan_off',list-after_plan,
    'code',case when cc<>'' then cc end,'code_id',c.id,'code_off',after_plan-total,'total',total);
end $fn$;

-- Adds a paid/free/admin period to a host. Safe to call twice with the same ref.
create or replace function apply_subscription(p_vendor uuid, p_months int, p_days int, p_list bigint, p_amount bigint,
  p_ref text, p_code_id uuid, p_kind text, p_actor uuid default null) returns timestamptz
language plpgsql security definer set search_path=public as $fn$
declare v vendors; st timestamptz; en timestamptz; pid uuid; cc text;
begin
  if p_ref is not null and exists(select 1 from subscriptions where payment_ref=p_ref) then
    select sub_until into en from vendors where id=p_vendor; return en; end if;
  select * into v from vendors where id=p_vendor for update;
  if not found then raise exception 'VENDOR_NOT_FOUND'; end if;
  st:=greatest(now(), coalesce(v.sub_until, now()));
  en:=st + make_interval(months=>coalesce(p_months,0), days=>coalesce(p_days,0));
  if p_amount>0 then
    insert into payments(vendor_id,kind,amount_fils,provider_ref,status,provider)
      values(p_vendor,'subscription',p_amount,p_ref,'captured','ziina') on conflict(provider_ref) do nothing;
  end if;
  if p_code_id is not null then
    update discount_codes set used_count=used_count+1 where id=p_code_id returning code into cc;
  end if;
  insert into subscriptions(vendor_id,kind,months,days,starts_at,ends_at,list_fils,amount_fils,code,payment_ref)
    values(p_vendor,p_kind,coalesce(p_months,0),coalesce(p_days,0),st,en,coalesce(p_list,0),coalesce(p_amount,0),cc,p_ref);
  update vendors set sub_until=en, activated_at=coalesce(activated_at,now()),
    status=case when status in('pending_activation','expired') then 'active' else status end
    where id=p_vendor;
  perform audit(p_vendor,p_actor,'subscription.'||p_kind,'vendor',p_vendor,
    jsonb_build_object('months',p_months,'days',p_days,'amount',p_amount,'until',en,'code',cc));
  return en;
end $fn$;

-- Locks hosts whose subscription has ended (runs every minute, see cron below).
create or replace function expire_subscriptions() returns int
language plpgsql security definer set search_path=public as $fn$
declare n int;
begin
  update vendors set status='expired' where status='active' and sub_until is not null and sub_until<now();
  get diagnostics n=row_count; return n;
end $fn$;

-- New hosts: free trial (admin sets the days; 0 = must subscribe first).
create or replace function vendors_before() returns trigger language plpgsql security definer set search_path=public as
$fn$ declare td int;
begin
  new.owner_id:=coalesce(auth.uid(), new.owner_id);
  select trial_days into td from platform_settings where id=1;
  if coalesce(td,0)>0 then new.status:='active'; new.sub_until:=now()+make_interval(days=>td); new.activated_at:=now();
  else new.status:='pending_activation'; new.sub_until:=null; end if;
  return new;
end $fn$;
create or replace function vendors_trial_row() returns trigger language plpgsql security definer set search_path=public as
$fn$ begin
  if new.sub_until is not null then
    insert into subscriptions(vendor_id,kind,days,starts_at,ends_at) values(new.id,'trial',greatest(1,ceil(extract(epoch from new.sub_until-now())/86400)::int),now(),new.sub_until);
  end if;
  return new;
end $fn$;
drop trigger if exists t_vendors_trial on vendors;
create trigger t_vendors_trial after insert on vendors for each row execute function vendors_trial_row();

revoke all on function sub_quote(int,text) from public, anon, authenticated;
revoke all on function apply_subscription(uuid,int,int,bigint,bigint,text,uuid,text,uuid) from public, anon, authenticated;
revoke all on function expire_subscriptions() from public, anon, authenticated;
revoke all on function vendors_trial_row() from public, anon, authenticated;
grant execute on function sub_quote(int,text), apply_subscription(uuid,int,int,bigint,bigint,text,uuid,text,uuid), expire_subscriptions() to service_role;

-- Existing hosts are test accounts: keep them running for a year.
update vendors set sub_until=now()+interval '1 year' where sub_until is null and status='active';

-- Run the expiry check every minute.
create extension if not exists pg_cron;
select cron.unschedule('expire-subscriptions') where exists(select 1 from cron.job where jobname='expire-subscriptions');
select cron.schedule('expire-subscriptions', '* * * * *', 'select public.expire_subscriptions()');
