-- Break the cross-table RLS cycle between offline_stores and offline_store_memberships.
-- These SECURITY DEFINER helpers are owned by postgres (BYPASSRLS) and use only
-- fully qualified relations, so policy evaluation does not recursively invoke
-- policies on the other table.

create or replace function private.offline_store_is_active(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(exists (
    select 1
    from public.offline_stores s
    where s.id = p_store_id
      and s.is_active = true
  ), false);
$function$;

revoke all on function private.offline_store_is_active(uuid) from public;
grant execute on function private.offline_store_is_active(uuid) to authenticated;

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
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and m.store_role = 'manager'
  ) and private.offline_store_is_active(p_store_id), false);
$function$;

revoke all on function private.offline_store_manager(uuid) from public;
grant execute on function private.offline_store_manager(uuid) to authenticated;

create or replace function private.offline_store_member(p_store_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(private.is_admin_or_owner(), false) or (
    exists (
      select 1
      from public.offline_store_memberships m
      where m.store_id = p_store_id
        and m.user_id = (select auth.uid())
        and m.is_active = true
        and (p_roles is null or m.store_role = any(p_roles))
    ) and private.offline_store_is_active(p_store_id)
  );
$function$;

revoke all on function private.offline_store_member(uuid, text[]) from public;
grant execute on function private.offline_store_member(uuid, text[]) to authenticated;

-- Central office roles must never be represented as store memberships.
-- Preserve history and records; only deactivate invalid active placements.
update public.offline_store_memberships m
set is_active = false
where m.is_active
  and exists (
    select 1
    from public.profiles p
    where p.id = m.user_id
      and p.role <> 'employee'
  );

-- Recreate the membership read policy against the non-recursive helper.
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
