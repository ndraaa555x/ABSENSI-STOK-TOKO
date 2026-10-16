-- Keep privileged offline-store RPC implementations in the non-exposed private schema.
-- Preserve the public RPC signatures with SECURITY INVOKER wrappers, and remove
-- default PUBLIC/anon execution from both layers.
DO $migration$
DECLARE
  r record;
  v_call_args text;
  v_body text;
  v_volatility text;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS identity_args,
           pg_get_function_arguments(p.oid) AS full_args,
           pg_get_function_result(p.oid) AS result_type,
           p.pronargs,
           p.proretset,
           p.provolatile
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN (
        'assign_offline_store_member',
        'complete_offline_store_sale',
        'create_offline_discount',
        'create_offline_local_product',
        'create_offline_stock_receipt',
        'create_offline_store',
        'create_offline_store_purchase',
        'deactivate_offline_store_job_title',
        'list_offline_store_members',
        'manage_offline_store_member',
        'pay_offline_store_purchase',
        'receive_offline_stock',
        'receive_offline_store_purchase',
        'reject_offline_store_purchase',
        'review_offline_product_submission',
        'save_offline_discount_policy',
        'save_offline_store_job_title',
        'set_offline_discount_active',
        'ship_offline_store_purchase',
        'submit_offline_product',
        'update_offline_store_team_attendance'
      )
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc q
      JOIN pg_namespace nq ON nq.oid = q.pronamespace
      WHERE nq.nspname = 'private'
        AND q.proname = r.proname
        AND pg_get_function_identity_arguments(q.oid) = r.identity_args
    ) THEN
      RAISE EXCEPTION 'Private function collision for %(%); stopping migration safely', r.proname, r.identity_args;
    END IF;

    SELECT string_agg('$' || g.i::text, ', ' ORDER BY g.i)
      INTO v_call_args
    FROM generate_series(1, r.pronargs) AS g(i);

    IF r.proretset THEN
      v_body := format('SELECT * FROM private.%I(%s);', r.proname, v_call_args);
    ELSE
      v_body := format('SELECT private.%I(%s);', r.proname, v_call_args);
    END IF;

    v_volatility := CASE r.provolatile
      WHEN 'i' THEN 'IMMUTABLE'
      WHEN 's' THEN 'STABLE'
      ELSE 'VOLATILE'
    END;

    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET SCHEMA private',
      r.proname,
      r.identity_args
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION private.%I(%s) FROM PUBLIC, anon',
      r.proname,
      r.identity_args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION private.%I(%s) TO authenticated, service_role',
      r.proname,
      r.identity_args
    );

    EXECUTE format(
      $create$
      CREATE FUNCTION public.%I(%s)
      RETURNS %s
      LANGUAGE sql
      %s
      SECURITY INVOKER
      SET search_path TO ''
      AS %L
      $create$,
      r.proname,
      r.full_args,
      r.result_type,
      v_volatility,
      v_body
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
      r.proname,
      r.identity_args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
      r.proname,
      r.identity_args
    );
  END LOOP;
END
$migration$;