-- Remove the direct offline_stores -> offline_store_memberships RLS dependency.
-- The SECURITY DEFINER membership helper performs the lookup with the owner
-- privileges, so evaluating either table's read policy does not recurse.
drop policy if exists offline_stores_read on public.offline_stores;

create policy offline_stores_read
on public.offline_stores
for select
to authenticated
using (
  (select private.is_admin_or_owner())
  or (select private.offline_store_member(id, null::text[]))
);
