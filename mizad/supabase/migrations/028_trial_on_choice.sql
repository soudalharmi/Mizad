-- 028 New hosts no longer get an automatic trial. After sign-up they land on the plan page and either
-- start the free trial (once, only if they never had any subscription) or pay for a plan.
create or replace function vendors_before() returns trigger language plpgsql security definer set search_path=public as
$fn$ begin
  new.owner_id:=coalesce(auth.uid(), new.owner_id);
  new.code_prefix:=gen_code_prefix(new.slug);
  new.status:='pending_activation'; new.sub_until:=null;
  return new;
end $fn$;

create or replace function start_trial(p_vendor uuid, p_actor uuid default null) returns timestamptz
language plpgsql security definer set search_path=public as $fn$
declare td int;
begin
  select trial_days into td from platform_settings where id=1;
  if coalesce(td,0)<=0 then raise exception 'TRIAL_OFF'; end if;
  perform 1 from vendors where id=p_vendor for update;
  if exists(select 1 from subscriptions where vendor_id=p_vendor) then raise exception 'TRIAL_USED'; end if;
  return apply_subscription(p_vendor,0,td,0,0,'trial-'||p_vendor::text,null,'trial',p_actor);
end $fn$;
revoke all on function start_trial(uuid,uuid) from public, anon, authenticated;
grant execute on function start_trial(uuid,uuid) to service_role;
