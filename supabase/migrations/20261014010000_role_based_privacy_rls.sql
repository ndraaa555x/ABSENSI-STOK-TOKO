-- Restrict employee data visibility by role and protect coworker privacy.
-- Owner/Admin can manage all employee records; employees can read only their own active employee row.
drop policy if exists employees_active_select on public.employees;
drop policy if exists employees_role_scoped_select on public.employees;
create policy employees_role_scoped_select on public.employees
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or (
    profile_id = (select auth.uid())
    and employment_status = 'active'
    and (select private.is_active_user())
  )
);

-- Leave requests are visible only to the request owner and management.
drop policy if exists leave_active_select on public.leave_requests;
drop policy if exists leave_role_scoped_select on public.leave_requests;
create policy leave_role_scoped_select on public.leave_requests
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or exists (
    select 1 from public.employees e
    where e.id = leave_requests.employee_id
      and e.profile_id = (select auth.uid())
      and (select private.is_active_user())
  )
);

-- Inventory and stock movement data are for operational management roles.
drop policy if exists products_active_select on public.products;
drop policy if exists products_admin_owner_select on public.products;
create policy products_admin_owner_select on public.products
for select to authenticated
using ((select private.is_admin_or_owner()));

drop policy if exists categories_active_select on public.product_categories;
drop policy if exists categories_admin_owner_select on public.product_categories;
create policy categories_admin_owner_select on public.product_categories
for select to authenticated
using ((select private.is_admin_or_owner()));

drop policy if exists stock_active_select on public.stock_movements;
drop policy if exists stock_admin_owner_select on public.stock_movements;
create policy stock_admin_owner_select on public.stock_movements
for select to authenticated
using ((select private.is_admin_or_owner()));
