-- Update 21: auto-approve fix.
-- There is no SMS step any more, so a bidder's phone counts as verified when the account has a phone,
-- and auto-approve no longer waits for an SMS confirmation that never happens.
create or replace function bidders_before() returns trigger language plpgsql security definer set search_path=public as $fn$
declare u auth.users; auto boolean;
begin
  select * into u from auth.users where id=new.user_id;
  select auto_approve into auto from vendors where id=new.vendor_id;
  new.phone:=u.phone;
  new.phone_verified:=(coalesce(u.phone,'')<>'');
  new.status:=case when coalesce(auto,false) then 'approved' else 'pending' end;
  return new;
end $fn$;

create or replace function sync_phone() returns trigger language plpgsql security definer set search_path=public as $fn$
begin
  update bidders set phone=new.phone, phone_verified=(coalesce(new.phone,'')<>'') where user_id=new.id;
  return new;
end $fn$;

-- Existing bidders who have a phone can bid.
update bidders b set phone_verified=true from auth.users u where u.id=b.user_id and coalesce(u.phone,'')<>'' and not b.phone_verified;
-- Hosts who already turned auto-approve on: approve their waiting requests now.
update bidders b set status='approved' from vendors v where v.id=b.vendor_id and v.auto_approve and b.status='pending';
