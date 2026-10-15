-- CANDIDATE ONLY — do not apply to production before restore testing.
-- Target: existing Supabase project xgagttyxpngkjfowaasf.
-- Finding: post_order_finance_on_approval() is a trigger function but EXECUTE
-- is granted to PUBLIC/anon/authenticated. Trigger execution does not require
-- end users to call the trigger function directly; confirm every trigger
-- dependency and application call path in an isolated restore before applying.
--
-- Proposed isolated-test migration:
REVOKE EXECUTE ON FUNCTION public.post_order_finance_on_approval()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_order_finance_on_approval()
  TO postgres, service_role;
--
-- Verification required after applying ONLY in isolated test:
-- 1. Existing trigger can still post finance when an order is approved.
-- 2. anon and authenticated cannot invoke the function directly.
-- 3. authenticated admin/owner approval flow still works through its intended
--    approved RPC/table update path.
-- 4. rejected orders/refunds do not post finance; repeated approvals do not
--    duplicate financial transactions.
-- 5. pg_trigger still references the same function OID and all related
--    constraints, RLS policies, and transaction rollback behavior pass.
--
-- This file intentionally contains no automatic execution against production.
