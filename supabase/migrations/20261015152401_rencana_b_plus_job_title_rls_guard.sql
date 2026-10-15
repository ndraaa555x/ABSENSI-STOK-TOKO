drop policy if exists offline_store_job_titles_manager_write on public.offline_store_job_titles;
create policy offline_store_job_titles_manager_write on public.offline_store_job_titles
for all to authenticated
using (
  private.is_admin_or_owner()
  or exists (
    select 1 from public.offline_store_memberships m
    join public.offline_stores s on s.id=m.store_id
    where m.store_id=offline_store_job_titles.store_id
      and m.user_id=auth.uid() and m.is_active and m.store_role='manager' and s.is_active
  )
)
with check (
  private.is_admin_or_owner()
  or exists (
    select 1 from public.offline_store_memberships m
    join public.offline_stores s on s.id=m.store_id
    where m.store_id=offline_store_job_titles.store_id
      and m.user_id=auth.uid() and m.is_active and m.store_role='manager' and s.is_active
  )
);
