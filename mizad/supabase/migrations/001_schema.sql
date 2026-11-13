-- MIZAD schema. All money = integer fils (1 AED = 100 fils). Run in Supabase SQL editor (or supabase db push).
create extension if not exists pgcrypto;

create table platform_settings(
  id int primary key default 1 check(id=1),
  activation_fee_fils bigint not null default 0 check(activation_fee_fils>=0), -- SET BEFORE LAUNCH (admin dashboard)
  item_fee_fils bigint not null default 250 check(item_fee_fils>=0),          -- AED 2.50
  billing_mode text not null default 'manual' check(billing_mode in('per_session','threshold','manual')),
  billing_threshold_fils bigint not null default 5000,
  support_hold_minutes int not null default 5,
  updated_at timestamptz not null default now());
insert into platform_settings default values;

create table profiles(id uuid primary key references auth.users on delete cascade,
  role text not null default 'bidder' check(role in('super_admin','vendor','bidder')), full_name text, created_at timestamptz default now());

create table vendors(id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id), slug text not null unique
    check(slug ~ '^[a-z0-9-]{3,30}$' and slug not in('admin','dashboard','login','api','_next')),
  name text not null, logo_url text,
  status text not null default 'pending_activation' check(status in('pending_activation','active','suspended')),
  activated_at timestamptz, created_at timestamptz default now());

create table bidders(id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id), user_id uuid not null references auth.users(id),
  name text not null, phone text, phone_verified boolean not null default false,
  status text not null default 'pending' check(status in('pending','approved','rejected','suspended')),
  created_at timestamptz default now(), unique(vendor_id,user_id));

create table auctions(id uuid primary key default gen_random_uuid(), vendor_id uuid not null references vendors(id),
  title text not null default 'Session', created_at timestamptz default now());

create table auction_items(id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id), auction_id uuid not null references auctions(id),
  name text not null, description text, image_url text, position int not null default 0,
  start_price_fils bigint not null check(start_price_fils>0),
  increment_fils bigint not null check(increment_fils>=200), -- >= AED 2: card providers reject tiny charges (verify with your provider)
  status text not null default 'queued' check(status in('queued','live','paused','sold','unsold')),
  current_price_fils bigint not null default 0, base_bid_fils bigint not null default 0,
  leader_bidder_id uuid references bidders(id), leader_name text,
  bid_count int not null default 0, version int not null default 0,
  opened_at timestamptz, closed_at timestamptz, created_at timestamptz default now());
create index on auction_items(vendor_id,status);

create table bids(id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id), item_id uuid not null references auction_items(id),
  bidder_id uuid not null references bidders(id), bidder_name text not null,
  amount_fils bigint not null check(amount_fils>0), idem_key text not null unique,
  created_at timestamptz not null default now(), unique(item_id,amount_fils));
create index on bids(item_id,created_at desc);

create table payments(id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id), kind text not null check(kind in('support','activation','invoice')),
  payer_user_id uuid, amount_fils bigint not null check(amount_fils>0), currency text not null default 'AED',
  provider text not null default 'stripe', provider_ref text not null unique,
  status text not null default 'requires_action' check(status in('requires_action','authorized','captured','canceled','failed','refunded')),
  provider_sync text not null default 'none' check(provider_sync in('none','cancel_needed','capture_needed','refund_needed')),
  idem_key text, created_at timestamptz default now());

create table support_contributions(id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id), item_id uuid not null references auction_items(id),
  supporter_id uuid not null references bidders(id), supporter_name text not null,
  beneficiary_id uuid not null references bidders(id), beneficiary_name text not null,
  price_before_fils bigint not null, price_after_fils bigint not null,
  amount_fils bigint not null check(amount_fils>0 and amount_fils=price_after_fils-price_before_fils),
  status text not null default 'pending_payment' check(status in('pending_payment','authorized','captured','released','refund_pending','refunded','failed','expired')),
  payment_id uuid references payments(id), idem_key text not null unique,
  expires_at timestamptz not null, created_at timestamptz default now(),
  check(supporter_id<>beneficiary_id));
create index on support_contributions(item_id,status);

create table refunds(id uuid primary key default gen_random_uuid(), payment_id uuid not null references payments(id),
  contribution_id uuid references support_contributions(id), amount_fils bigint not null, reason text,
  status text not null default 'pending' check(status in('pending','succeeded','failed')), created_at timestamptz default now());

create table invoices(id uuid primary key default gen_random_uuid(), vendor_id uuid not null references vendors(id),
  total_fils bigint not null default 0, status text not null default 'open' check(status in('open','paid')),
  created_at timestamptz default now(), paid_at timestamptz);

-- exactly one fee row per item => AED 2.50 is never charged twice
create table item_service_fees(id uuid primary key default gen_random_uuid(), vendor_id uuid not null references vendors(id),
  item_id uuid not null unique references auction_items(id), amount_fils bigint not null,
  invoice_id uuid references invoices(id), created_at timestamptz default now());

create table vendor_activation_payments(id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null unique references vendors(id), payment_id uuid references payments(id),
  amount_fils bigint not null, paid_at timestamptz default now());

create table notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null, vendor_id uuid,
  type text not null, body text, read boolean default false, created_at timestamptz default now());
create table audit_logs(id bigserial primary key, vendor_id uuid, actor_id uuid, action text not null, entity text, entity_id uuid,
  data jsonb, created_at timestamptz default now());
create table webhook_events(id text primary key, created_at timestamptz default now());

-- ===== helpers & triggers =====
create function is_admin() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from profiles where id=auth.uid() and role='super_admin') $$;
create function owns_vendor(v uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from vendors where id=v and owner_id=auth.uid()) $$;
create function audit(p_vendor uuid,p_actor uuid,p_action text,p_entity text,p_id uuid,p_data jsonb default '{}')
returns void language sql security definer set search_path=public as
$$ insert into audit_logs(vendor_id,actor_id,action,entity,entity_id,data) values(p_vendor,p_actor,p_action,p_entity,p_id,p_data) $$;

create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as
$$ begin insert into profiles(id) values(new.id) on conflict do nothing; return new; end $$;
create trigger on_auth_user after insert on auth.users for each row execute function handle_new_user();

create function vendors_before() returns trigger language plpgsql security definer set search_path=public as
$$ begin new.owner_id:=auth.uid(); new.status:='pending_activation'; return new; end $$;
create trigger t_vendors_before before insert on vendors for each row execute function vendors_before();
create function vendors_after() returns trigger language plpgsql security definer set search_path=public as
$$ begin update profiles set role='vendor' where id=new.owner_id and role='bidder';
  insert into auctions(vendor_id) values(new.id); return new; end $$;
create trigger t_vendors_after after insert on vendors for each row execute function vendors_after();

create function bidders_before() returns trigger language plpgsql security definer set search_path=public as
$$ declare u auth.users; begin select * into u from auth.users where id=new.user_id;
  new.phone:=u.phone; new.phone_verified:=(u.phone_confirmed_at is not null); new.status:='pending'; return new; end $$;
create trigger t_bidders_before before insert on bidders for each row execute function bidders_before();

create function items_before() returns trigger language plpgsql as
$$ begin new.current_price_fils:=new.start_price_fils; new.base_bid_fils:=0; new.status:='queued'; return new; end $$;
create trigger t_items_before before insert on auction_items for each row execute function items_before();

-- ===== RLS =====
alter table platform_settings enable row level security; alter table profiles enable row level security;
alter table vendors enable row level security; alter table bidders enable row level security;
alter table auctions enable row level security; alter table auction_items enable row level security;
alter table bids enable row level security; alter table payments enable row level security;
alter table support_contributions enable row level security; alter table refunds enable row level security;
alter table invoices enable row level security; alter table item_service_fees enable row level security;
alter table vendor_activation_payments enable row level security; alter table notifications enable row level security;
alter table audit_logs enable row level security; alter table webhook_events enable row level security;

create policy ps_read on platform_settings for select using(true);
create policy prof_read on profiles for select using(id=auth.uid() or is_admin());
create policy v_read on vendors for select using(status='active' or owner_id=auth.uid() or is_admin());
create policy v_ins on vendors for insert to authenticated with check(owner_id=auth.uid());
create policy v_upd on vendors for update to authenticated using(owner_id=auth.uid());
create policy b_read on bidders for select using(user_id=auth.uid() or owns_vendor(vendor_id) or is_admin());
create policy b_ins on bidders for insert to authenticated with check(user_id=auth.uid());
create policy b_upd on bidders for update to authenticated using(owns_vendor(vendor_id)); -- status only (column grant)
create policy a_read on auctions for select using(owns_vendor(vendor_id) or is_admin());
create policy a_ins on auctions for insert to authenticated with check(owns_vendor(vendor_id));
create policy i_read on auction_items for select using(owns_vendor(vendor_id) or is_admin()
  or exists(select 1 from vendors v where v.id=vendor_id and v.status='active'));
create policy i_ins on auction_items for insert to authenticated with check(owns_vendor(vendor_id)
  and exists(select 1 from vendors v where v.id=vendor_id and v.status='active'));
create policy i_upd on auction_items for update to authenticated using(owns_vendor(vendor_id) and status='queued');
create policy bids_read on bids for select using(owns_vendor(vendor_id) or is_admin()
  or exists(select 1 from bidders b where b.vendor_id=bids.vendor_id and b.user_id=auth.uid() and b.status='approved'));
create policy sc_read on support_contributions for select using(owns_vendor(vendor_id) or is_admin()
  or exists(select 1 from bidders b where b.user_id=auth.uid() and b.id in(supporter_id,beneficiary_id)));
create policy pay_read on payments for select using(owns_vendor(vendor_id) or is_admin() or payer_user_id=auth.uid());
create policy ref_read on refunds for select using(is_admin() or exists(select 1 from payments p where p.id=payment_id and (owns_vendor(p.vendor_id) or p.payer_user_id=auth.uid())));
create policy inv_read on invoices for select using(owns_vendor(vendor_id) or is_admin());
create policy fee_read on item_service_fees for select using(owns_vendor(vendor_id) or is_admin());
create policy act_read on vendor_activation_payments for select using(owns_vendor(vendor_id) or is_admin());
create policy n_read on notifications for select using(user_id=auth.uid());
create policy n_upd on notifications for update using(user_id=auth.uid());
create policy audit_read on audit_logs for select using(owns_vendor(vendor_id) or is_admin());

-- Column-level lockdown: browsers can never write prices, winners, fees or ledgers directly.
revoke insert,update,delete on all tables in schema public from anon,authenticated;
grant select on all tables in schema public to authenticated;
grant select on vendors,auction_items,platform_settings to anon;
grant insert(slug,name) on vendors to authenticated;  grant update(name,logo_url) on vendors to authenticated;
grant insert(vendor_id,user_id,name) on bidders to authenticated; grant update(status) on bidders to authenticated;
grant insert(vendor_id,title) on auctions to authenticated;
grant insert(vendor_id,auction_id,name,description,image_url,position,start_price_fils,increment_fils) on auction_items to authenticated;
grant update(name,description,image_url,position) on auction_items to authenticated;
grant update(read) on notifications to authenticated;

-- Storage for product images (folder = vendor id)
insert into storage.buckets(id,name,public) values('products','products',true) on conflict do nothing;
create policy prod_up on storage.objects for insert to authenticated
  with check(bucket_id='products' and owns_vendor(((storage.foldername(name))[1])::uuid));

alter publication supabase_realtime add table auction_items,bids,support_contributions,bidders,notifications;
