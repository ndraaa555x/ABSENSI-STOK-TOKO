-- Keep privileged SECURITY DEFINER implementations out of the exposed public API schema.
ALTER FUNCTION public.set_product_stock(uuid, numeric, text) SET SCHEMA private;
ALTER FUNCTION public.submit_product_order(uuid, numeric, text, uuid, text, text) SET SCHEMA private;
ALTER FUNCTION public.submit_product_order_multi(jsonb, text, uuid, text, text) SET SCHEMA private;
ALTER FUNCTION public.submit_product_refund(uuid, uuid, numeric, text) SET SCHEMA private;
ALTER FUNCTION public.record_attendance(uuid, text, text) SET SCHEMA private;

REVOKE ALL ON FUNCTION private.set_product_stock(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_product_stock(uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION private.submit_product_order(uuid, numeric, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.submit_product_order(uuid, numeric, text, uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION private.submit_product_order_multi(jsonb, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.submit_product_order_multi(jsonb, text, uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION private.submit_product_refund(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.submit_product_refund(uuid, uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION private.record_attendance(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_attendance(uuid, text, text) TO authenticated;

CREATE FUNCTION public.set_product_stock(
  p_product_id uuid,
  p_target_stock numeric,
  p_reason text DEFAULT 'Penyesuaian stok melalui edit produk'
)
RETURNS numeric
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.set_product_stock($1, $2, $3);
$function$;

CREATE FUNCTION public.submit_product_order(
  p_product_id uuid,
  p_quantity numeric,
  p_notes text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT 'other',
  p_payment_evidence_path text DEFAULT NULL
)
RETURNS TABLE(order_id uuid, order_code text)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT * FROM private.submit_product_order($1, $2, $3, $4, $5, $6);
$function$;

CREATE FUNCTION public.submit_product_order_multi(
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT 'other',
  p_payment_evidence_path text DEFAULT NULL
)
RETURNS TABLE(order_id uuid, order_code text)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT * FROM private.submit_product_order_multi($1, $2, $3, $4, $5);
$function$;

CREATE FUNCTION public.submit_product_refund(
  p_order_id uuid,
  p_order_item_id uuid,
  p_quantity numeric,
  p_reason text
)
RETURNS TABLE(refund_id uuid, refund_code text)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT * FROM private.submit_product_refund($1, $2, $3, $4);
$function$;

CREATE FUNCTION public.record_attendance(
  p_employee_id uuid,
  p_action text,
  p_evidence_path text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.record_attendance($1, $2, $3);
$function$;

REVOKE ALL ON FUNCTION public.set_product_stock(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_stock(uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_product_order(uuid, numeric, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_product_order(uuid, numeric, text, uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_product_order_multi(jsonb, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_product_order_multi(jsonb, text, uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_product_refund(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_product_refund(uuid, uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.record_attendance(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_attendance(uuid, text, text) TO authenticated;
