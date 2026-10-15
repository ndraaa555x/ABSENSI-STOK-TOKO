drop policy if exists employees_store_manager_select on public.employees;
create policy employees_store_manager_select on public.employees
for select to authenticated
using (
  exists (
    select 1 from public.offline_store_memberships target_member
    join public.offline_stores s on s.id=target_member.store_id and s.is_active
    join public.offline_store_memberships manager on manager.store_id=target_member.store_id
    where target_member.user_id=employees.profile_id and target_member.is_active
      and manager.user_id=auth.uid() and manager.is_active and manager.store_role='manager'
  )
);
