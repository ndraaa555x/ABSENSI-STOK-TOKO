-- Offline-store operational data is only for authenticated, policy-scoped users.
-- Remove inherited table access for the anonymous API role as defense in depth.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'offline\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM anon', r.schemaname, r.tablename);
  END LOOP;
END
$$;