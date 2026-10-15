-- Keep membership visibility and placement semantics distinct from central ownership.
drop policy if exists offline_memberships_read on public.offline_store_memberships;
create policy offline_memberships_read on public.offline_store_memberships
for select to authenticated
using (
  private.is_admin_or_owner()
  or (user_id=auth.uid() and is_active)
  or exists (
    select 1 from public.offline_store_memberships manager
    join public.offline_stores s on s.id=manager.store_id
    where manager.store_id=offline_store_memberships.store_id
      and manager.user_id=auth.uid() and manager.is_active
      and manager.store_role='manager' and s.is_active
  )
);

-- Preserve legacy central-account membership history without treating it as a store placement.
update public.offline_store_memberships m
set is_active=false
from public.profiles p
where p.id=m.user_id and p.role in ('owner','admin') and m.is_active;
