-- Security hardening (Supabase advisor): pin search_path on 4 functions. Applied via the Supabase connector.
alter function public.assign_session() set search_path = public;
alter function public.items_before() set search_path = public;
alter function public.sm_commission(sales_rules,text,bigint) set search_path = public;
alter function public.vendors_currency_lock() set search_path = public;
