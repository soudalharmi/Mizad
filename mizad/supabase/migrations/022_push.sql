-- Update 22: "You've been outbid" notifications (Web Push).
create table if not exists push_subs(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null,
  lang text not null default 'ar', created_at timestamptz not null default now());
create index if not exists push_subs_user on push_subs(user_id);
alter table push_subs enable row level security;
revoke all on push_subs from anon, authenticated;
grant all on push_subs to service_role;

-- The server creates its notification keys automatically on first use and keeps them here (server only).
create table if not exists push_config(id int primary key default 1 check(id=1), public_key text not null, private_key text not null);
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;
grant all on push_config to service_role;

notify pgrst, 'reload schema';
