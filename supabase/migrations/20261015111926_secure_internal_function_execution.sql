-- Tighten execution grants for internal SECURITY DEFINER helpers.
-- HRD/admin/owner policy helper is used by authenticated RLS policies only.
REVOKE ALL ON FUNCTION private.is_hrd_or_admin_or_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_hrd_or_admin_or_owner() TO authenticated;

-- This function is invoked by a database trigger; callers must not execute it directly.
REVOKE ALL ON FUNCTION private.release_rejected_order_stock() FROM PUBLIC, anon, authenticated;

-- Keep business RPCs callable only by authenticated users, not anonymous/PUBLIC roles.
REVOKE ALL ON FUNCTION public.set_product_stock(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_stock(uuid, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_product_order(uuid, numeric, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_product_order(uuid, numeric, text, uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_product_order_multi(jsonb, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_product_order_multi(jsonb, text, uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_product_refund(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_product_refund(uuid, uuid, numeric, text) TO authenticated;
