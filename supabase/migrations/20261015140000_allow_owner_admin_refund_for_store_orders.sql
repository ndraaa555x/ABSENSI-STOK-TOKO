CREATE OR REPLACE FUNCTION private.submit_product_refund(p_order_id uuid, p_order_item_id uuid, p_quantity numeric, p_reason text)
RETURNS TABLE(refund_id uuid, refund_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_order public.product_orders%rowtype;
  v_item public.product_order_items%rowtype;
  v_used numeric;
  v_code text;
  v_refund_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_active_user() THEN
    RAISE EXCEPTION 'Akun tidak aktif atau belum login';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Jumlah dan alasan refund wajib diisi';
  END IF;

  -- Employees may refund only their own orders; Admin/Owner may initiate refunds
  -- for any eligible store order as part of their management responsibility.
  SELECT *
    INTO v_order
    FROM public.product_orders
   WHERE id = p_order_id
     AND status IN ('approved', 'fulfilled')
     AND (ordered_by = auth.uid() OR private.is_admin_or_owner())
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order tidak ditemukan, belum disetujui/dipenuhi, atau akun tidak berwenang mengajukan refund';
  END IF;

  SELECT *
    INTO v_item
    FROM public.product_order_items
   WHERE id = p_order_item_id AND order_id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk tidak cocok dengan order yang dipilih';
  END IF;

  SELECT coalesce(sum(quantity), 0)
    INTO v_used
    FROM public.product_refunds
   WHERE order_item_id = p_order_item_id AND status IN ('pending', 'approved');
  IF v_used + p_quantity > v_item.quantity THEN
    RAISE EXCEPTION 'Jumlah refund melebihi sisa jumlah yang dapat direfund';
  END IF;

  v_code := 'REF-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  INSERT INTO public.product_refunds(refund_code, order_id, order_item_id, requested_by, quantity, amount, reason)
  VALUES (v_code, p_order_id, p_order_item_id, auth.uid(), p_quantity, p_quantity * v_item.unit_price, trim(p_reason))
  RETURNING id INTO v_refund_id;

  RETURN QUERY SELECT v_refund_id, v_code;
END;
$function$;

REVOKE ALL ON FUNCTION private.submit_product_refund(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.submit_product_refund(uuid, uuid, numeric, text) TO authenticated;
