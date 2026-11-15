-- Update 19: date of birth on accounts, password reset by phone/email + date of birth,
-- and hosts created in one step at sign-up (server creates the auction page).

alter table profiles add column if not exists dob date;

-- Let the server (service role, no auth.uid()) create a host page for a given owner.
-- A signed-in user still always gets their own id, so nobody can create a page for someone else.
create or replace function vendors_before() returns trigger language plpgsql security definer set search_path=public as
$fn$ begin new.owner_id:=coalesce(auth.uid(), new.owner_id); new.status:='pending_activation'; return new; end $fn$;

-- Failed reset attempts are recorded so date-of-birth guessing is blocked (5 wrong tries per hour per account).
create table if not exists reset_attempts(id bigserial primary key, ident text not null, ok boolean not null, created_at timestamptz not null default now());
create index if not exists reset_attempts_ident on reset_attempts(ident, created_at);
alter table reset_attempts enable row level security;
revoke all on reset_attempts from anon, authenticated;
grant all on reset_attempts to service_role;
grant usage, select on sequence reset_attempts_id_seq to service_role;

-- Returns the user id when phone (bidder) or email (host) matches the date of birth; otherwise raises.
create or replace function reset_verify(p_kind text, p_ident text, p_dob date) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare uid uuid; d text; key text; fails int;
begin
  if p_kind='bidder' then
    d:=regexp_replace(coalesce(p_ident,''),'\D','','g');
    if length(d)<8 then raise exception 'RESET_FAIL'; end if;
    key:='p:'||d;
  else
    key:='e:'||lower(btrim(coalesce(p_ident,'')));
  end if;
  select count(*) into fails from reset_attempts where ident=key and not ok and created_at>now()-interval '1 hour';
  if fails>=5 then raise exception 'RESET_LOCKED'; end if;
  if p_kind='bidder' then
    select u.id into uid from auth.users u join profiles p on p.id=u.id
      where regexp_replace(coalesce(u.phone,''),'\D','','g')=d and p.dob=p_dob limit 1;
  else
    select u.id into uid from auth.users u join profiles p on p.id=u.id
      where lower(u.email)=lower(btrim(p_ident)) and p.dob=p_dob limit 1;
  end if;
  insert into reset_attempts(ident,ok) values(key, uid is not null);
  if uid is null then raise exception 'RESET_FAIL'; end if;
  return uid;
end $fn$;
revoke all on function reset_verify(text,text,date) from public, anon, authenticated;
grant execute on function reset_verify(text,text,date) to service_role;

-- Is this page link free?
create or replace function slug_available(p_slug text) returns boolean language sql security definer set search_path=public as
$fn$ select not exists(select 1 from vendors where slug=lower(p_slug)) $fn$;
revoke all on function slug_available(text) from public, anon, authenticated;
grant execute on function slug_available(text) to service_role;

notify pgrst, 'reload schema';
