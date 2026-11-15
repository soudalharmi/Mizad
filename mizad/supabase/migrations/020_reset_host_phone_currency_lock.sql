-- Update 20: host password reset needs email + phone + date of birth; currency can never change after sign-up.
create or replace function reset_verify(p_kind text, p_ident text, p_dob date, p_phone text default null) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare uid uuid; d text; key text; fails int;
begin
  d:=regexp_replace(coalesce(case when p_kind='bidder' then p_ident else p_phone end,''),'\D','','g');
  if length(d)<8 then raise exception 'RESET_FAIL'; end if;
  key:=case when p_kind='bidder' then 'p:'||d else 'e:'||lower(btrim(coalesce(p_ident,''))) end;
  select count(*) into fails from reset_attempts where ident=key and not ok and created_at>now()-interval '1 hour';
  if fails>=5 then raise exception 'RESET_LOCKED'; end if;
  if p_kind='bidder' then
    select u.id into uid from auth.users u join profiles p on p.id=u.id
      where regexp_replace(coalesce(u.phone,''),'\D','','g')=d and p.dob=p_dob limit 1;
  else
    select u.id into uid from auth.users u join profiles p on p.id=u.id join vendors v on v.owner_id=u.id
      where lower(u.email)=lower(btrim(p_ident)) and p.dob=p_dob
        and regexp_replace(coalesce(v.phone,''),'\D','','g')=d limit 1;
  end if;
  insert into reset_attempts(ident,ok) values(key, uid is not null);
  if uid is null then raise exception 'RESET_FAIL'; end if;
  return uid;
end $fn$;
drop function if exists reset_verify(text,text,date);
revoke all on function reset_verify(text,text,date,text) from public, anon, authenticated;
grant execute on function reset_verify(text,text,date,text) to service_role;

-- The currency chosen at sign-up is final.
create or replace function vendors_currency_lock() returns trigger language plpgsql as $fn$
begin
  if new.currency is distinct from old.currency then raise exception 'CURRENCY_LOCKED'; end if;
  return new;
end $fn$;

notify pgrst, 'reload schema';
