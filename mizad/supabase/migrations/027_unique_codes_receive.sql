-- 027 Product codes unique across ALL hosts: each host gets a 2-letter prefix (e.g. GA-0001).
-- The same code is used on the live-auction item (auction_items.ref_code) and in My Sales.
-- Also: product name optional (falls back to the category, then the code); asked price only for Order Sale.

alter table vendors add column if not exists code_prefix text;

create or replace function gen_code_prefix(p_slug text) returns text
language plpgsql security definer set search_path=public as $fn$
declare a text:='ABCDEFGHJKLMNPQRSTUVWXYZ'; p text; n int:=0; w text:='';
begin
  -- first try the initials of the page link, e.g. golden-auction -> GA
  select string_agg(left(x,1),'') into w from regexp_split_to_table(lower(coalesce(p_slug,'')),'-') x where x ~ '^[a-z]';
  w:=upper(coalesce(w,''));
  if length(w)<2 then w:=upper(left(regexp_replace(coalesce(p_slug,''),'[^a-zA-Z]','','g'),2)); end if;
  p:=left(w,2);
  loop
    exit when p ~ '^[A-Z]{2,3}$' and p not in('MB','MZ') and not exists(select 1 from vendors where code_prefix=p);
    n:=n+1;
    p:=substr(a,1+floor(random()*24)::int,1)||substr(a,1+floor(random()*24)::int,1)||case when n>300 then substr(a,1+floor(random()*24)::int,1) else '' end;
  end loop;
  return p;
end $fn$;
revoke all on function gen_code_prefix(text) from public, anon, authenticated;

do $$ declare r record; begin
  for r in select id, slug from vendors where code_prefix is null order by created_at loop
    update vendors set code_prefix=gen_code_prefix(r.slug) where id=r.id;
  end loop;
end $$;
alter table vendors alter column code_prefix set not null;
create unique index if not exists vendors_code_prefix_key on vendors(code_prefix);

-- new hosts get their prefix automatically (keeps the trial logic from 026)
create or replace function vendors_before() returns trigger language plpgsql security definer set search_path=public as
$fn$ declare td int;
begin
  new.owner_id:=coalesce(auth.uid(), new.owner_id);
  new.code_prefix:=gen_code_prefix(new.slug);
  select trial_days into td from platform_settings where id=1;
  if coalesce(td,0)>0 then new.status:='active'; new.sub_until:=now()+make_interval(days=>td); new.activated_at:=now();
  else new.status:='pending_activation'; new.sub_until:=null; end if;
  return new;
end $fn$;

-- new-style codes can never repeat, even between hosts (older MB-/MZ- codes are left as they were)
create unique index if not exists sale_products_code_global on sale_products(code) where code !~ '^(MB|MZ)-';
create unique index if not exists auction_items_ref_code_global on auction_items(ref_code) where ref_code is not null and ref_code !~ '^(MB|MZ)-';

create or replace function sm_receive(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path=public as $fn$
declare
  vid uuid; r sales_rules; oid uuid; ph text; onm text; pfx text;
  fee bigint:=0; cd text; rr text; pid uuid; iid uuid; k int;
  m text:=p->>'method';
  own boolean:=coalesce((p->>'own')::boolean,false);
  sp bigint:=(p->>'start_fils')::bigint;
  inc bigint:=(p->>'inc_fils')::bigint;
  nm text:=btrim(coalesce(p->>'name',''));
  photos text[];
  asked bigint:=nullif(p->>'asked_fils','')::bigint;
  up boolean:=coalesce((p->>'upfront')::boolean,false);
  cat text:=nullif(btrim(coalesce(p->>'category','')),'');
  dsc text:=nullif(btrim(coalesce(p->>'description','')),'');
begin
  vid:=sm_vendor(p_user); r:=sm_rules(vid);
  if m is null or m not in('order','regular') then raise exception 'BAD_INPUT'; end if;
  if sp is null or sp<=0 or inc is null or inc<200 then raise exception 'BAD_PRICE'; end if;
  if m<>'order' then asked:=null; end if;
  if not own then
    ph:=btrim(coalesce(p->>'owner_phone',''));
    onm:=btrim(coalesce(p->>'owner_name',''));
    if length(regexp_replace(ph,'\D','','g'))<8 or onm='' then raise exception 'OWNER_REQUIRED'; end if;
    select id into oid from sale_owners where vendor_id=vid and phone=ph;
    if oid is null then insert into sale_owners(vendor_id,name,phone) values(vid,onm,ph) returning id into oid;
    else update sale_owners set name=onm where id=oid; end if;
    fee:=case when m='order' then r.order_listing_fils else r.regular_listing_fils end;
  end if;
  select code_prefix into pfx from vendors where id=vid;
  loop
    insert into sale_counters(vendor_id,kind,n) values(vid,'code',1)
      on conflict(vendor_id,kind) do update set n=sale_counters.n+1 returning n into k;
    cd:=pfx||'-'||lpad(k::text,4,'0');
    exit when not exists(select 1 from auction_items where ref_code=cd)
      and not exists(select 1 from sale_products where code=cd);
  end loop;
  if nm='' then nm:=coalesce(cat,cd); end if;
  rr:=sm_next(vid,'rr');
  select coalesce(array_agg(x),'{}'::text[]) into photos from jsonb_array_elements_text(coalesce(p->'photos','[]'::jsonb)) x;
  insert into auction_items(vendor_id,name,description,image_url,ref_code,position,start_price_fils,increment_fils,auction_type)
  values(vid,nm,dsc,photos[1],cd,(select coalesce(max(position),0)+1 from auction_items where vendor_id=vid),
    case when m='order' then 100 else sp end, case when m='order' then 200 else inc end,
    case when m='order' then 'custom' else 'standard' end)
  returning id into iid;
  if m='order' then insert into item_secrets(item_id,vendor_id,start_price_fils,increment_fils) values(iid,vid,sp,inc); end if;
  insert into item_private(item_id,vendor_id,owner_name,owner_phone,asked_price_fils,category) values(iid,vid,onm,ph,asked,cat);
  insert into sale_products(vendor_id,code,item_id,owner_id,name,category,description,photos,asked_fils,method,
    start_fils,inc_fils,received_on,notes,stage,listing_fee_fils,listing_when,listing_upfront,rules_intake,rr_no)
  values(vid,cd,iid,oid,nm,cat,dsc,photos,asked,m,sp,inc,
    coalesce(nullif(p->>'received_on','')::date,(now() at time zone 'Asia/Dubai')::date),
    nullif(btrim(coalesce(p->>'notes','')),''),'listed',fee,r.listing_when,(up and fee>0),to_jsonb(r),rr)
  returning id into pid;
  perform sm_log(vid,pid,p_user,'received',jsonb_build_object('rr_no',rr,'owner',onm,'listing_fee',fee,'upfront',(up and fee>0)));
  perform sm_log(vid,pid,p_user,'listed',jsonb_build_object('method',m));
  return jsonb_build_object('id',pid,'code',cd,'rr_no',rr);
end $fn$;
revoke all on function sm_receive(uuid,jsonb) from public, anon, authenticated;
grant execute on function sm_receive(uuid,jsonb) to service_role;
