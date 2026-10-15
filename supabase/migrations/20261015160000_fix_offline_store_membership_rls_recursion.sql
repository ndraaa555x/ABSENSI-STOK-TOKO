-- Avoid self-referencing RLS on offline_store_memberships.
-- This narrowly scoped SECURITY DEFINER helper reads only whether the current
-- authenticated user is an active manager of the requested active store.
create or replace function private.offline_store_manager(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(exists (
    select 1
    from public.offline_store_memberships m
    join public.offline_stores s on s.id = m.store_id
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and m.store_role = 'manager'
      and s.is_active = true
  ), false);
$function$;

revoke all on function private.offline_store_manager(uuid) from public;
grant execute on function private.offline_store_manager(uuid) to authenticated;

drop policy if exists offline_memberships_read on public.offline_store_memberships;
create policy offline_memberships_read
on public.offline_store_memberships
for select
to authenticated
using (
  (select private.is_admin_or_owner())
  or (user_id = (select auth.uid()) and is_active)
  or (select private.offline_store_manager(store_id))
);
