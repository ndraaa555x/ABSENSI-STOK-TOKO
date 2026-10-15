-- All offline-store writes are routed through validated SECURITY DEFINER RPCs.
-- Remove redundant permissive write policies to keep RLS read policies unambiguous.
drop policy if exists offline_receipts_insert on public.offline_stock_receipts;
drop policy if exists offline_categories_write on public.offline_store_categories;
drop policy if exists offline_store_job_titles_manager_write on public.offline_store_job_titles;
drop policy if exists offline_memberships_admin_write on public.offline_store_memberships;
drop policy if exists offline_stores_admin_write on public.offline_stores;
