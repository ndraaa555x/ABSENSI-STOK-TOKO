-- Resolve transaction actor labels without granting broad profile-table access.
-- The public RPC is SECURITY INVOKER; the implementation stays in the private schema.
CREATE OR REPLACE FUNCTION private.list_transaction_people()
RETURNS TABLE(id uuid, full_name text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_active_user() THEN
    RAISE EXCEPTION 'Sesi aktif diperlukan';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.role
  FROM public.profiles AS p
  WHERE private.is_admin_or_owner()
     OR (
       private.is_hrd_or_admin_or_owner()
       AND (
         p.id = (SELECT auth.uid())
         OR EXISTS (
           SELECT 1
           FROM public.employees AS e
           WHERE e.profile_id = p.id
             AND e.employment_status = 'active'
         )
       )
     )
     OR p.id = (SELECT auth.uid())
     OR EXISTS (
       SELECT 1
       FROM public.offline_store_memberships AS own
       JOIN public.offline_store_memberships AS teammate
         ON teammate.store_id = own.store_id
       WHERE own.user_id = (SELECT auth.uid())
         AND own.is_active = true
         AND teammate.user_id = p.id
         AND teammate.is_active = true
     );
END
$function$;

REVOKE ALL ON FUNCTION private.list_transaction_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_transaction_people() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_transaction_people()
RETURNS TABLE(id uuid, full_name text, role text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT * FROM private.list_transaction_people();
$function$;

REVOKE ALL ON FUNCTION public.list_transaction_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_transaction_people() TO authenticated;
