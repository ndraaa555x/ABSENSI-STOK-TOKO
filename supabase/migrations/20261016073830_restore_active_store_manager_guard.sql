-- Restore the active-store check in the manager predicate used by membership RLS.
-- Without this guard, managers could still match membership policies for inactive stores.
CREATE OR REPLACE FUNCTION private.offline_store_manager(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.offline_store_memberships m
      WHERE m.store_id = p_store_id
        AND m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND m.store_role = 'manager'
    ) AND private.offline_store_is_active(p_store_id),
    false
  );
$function$;

REVOKE ALL ON FUNCTION private.offline_store_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.offline_store_manager(uuid) TO authenticated;