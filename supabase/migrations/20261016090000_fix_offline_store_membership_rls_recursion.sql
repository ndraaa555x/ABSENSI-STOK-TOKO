-- Break the RLS cycle between offline_store_memberships and offline_stores.
-- The manager predicate must not read offline_stores because its SELECT policy
-- checks offline_store_memberships again.
create or replace function private.offline_store_manager(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(exists (
    select 1
    from public.offline_store_memberships m
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and m.store_role = 'manager'
  ), false);
$function$;
