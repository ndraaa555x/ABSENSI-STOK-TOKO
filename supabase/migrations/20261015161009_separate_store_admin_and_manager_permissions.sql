-- Do not silently treat Store Admin as Store Manager.
-- Store Admin permissions are granted explicitly by each policy/RPC; this keeps
-- management-only actions (promotions, discount policy, team and payment controls)
-- exclusive to true managers and central Owner/Admin.
create or replace function private.offline_store_member(
  p_store_id uuid,
  p_roles text[] default null::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(private.is_admin_or_owner(), false) or exists (
    select 1
    from public.offline_store_memberships m
    join public.offline_stores s on s.id = m.store_id
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and s.is_active
      and (p_roles is null or m.store_role = any(p_roles))
  );
$function$;

-- Store Admin is explicitly allowed to use POS, without inheriting manager-only
-- permissions from the shared helper.
do $migration$
declare
  v_definition text;
  v_old text := 'array[''manager'',''cashier'']';
  v_new text := 'array[''manager'',''store_admin'',''cashier'']';
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'complete_offline_store_sale';
  if v_definition is null then
    raise exception 'complete_offline_store_sale was not found';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  if position(v_new in v_definition) = 0 then
    raise exception 'Expected POS role check was not found';
  end if;
  execute v_definition;
end;
$migration$;
