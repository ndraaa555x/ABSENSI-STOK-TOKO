-- Fix refund approval while preserving caller RLS (SECURITY INVOKER).
-- Serialize approvals by locking the parent order, then read order items without FOR UPDATE.
-- This avoids requiring UPDATE policy/privilege on product_order_items.
CREATE OR REPLACE FUNCTION public.approve_product_refund(p_refund_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_refund public.product_refunds%rowtype;
  v_item public.product_order_items%rowtype;
  v_order public.product_orders%rowtype;
  v_code text;
  v_transaction_id uuid;
  v_prior_refund numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin_or_owner() THEN
    RAISE EXCEPTION 'Hanya Admin/Owner aktif yang dapat memeriksa refund';
  END IF;

  SELECT * INTO v_refund
  FROM public.product_refunds
  WHERE id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund tidak ditemukan';
  END IF;

  IF v_refund.status <> 'pending' OR v_refund.posted_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Refund ini sudah pernah diproses';
  END IF;

  -- Lock the parent order to serialize approval of multiple refunds from that order.
  SELECT * INTO v_order
  FROM public.product_orders
  WHERE id = v_refund.order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.status NOT IN ('approved', 'fulfilled') THEN
    RAISE EXCEPTION 'Order asal tidak valid untuk refund';
  END IF;

  -- Deliberately no FOR UPDATE here: product_order_items has no UPDATE RLS policy.
  SELECT * INTO v_item
  FROM public.product_order_items
  WHERE id = v_refund.order_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Detail order tidak ditemukan';
  END IF;

  IF v_item.order_id <> v_refund.order_id OR v_refund.quantity > v_item.quantity THEN
    RAISE EXCEPTION 'Jumlah refund melebihi detail order';
  END IF;

  SELECT coalesce(sum(quantity), 0)
  INTO v_prior_refund
  FROM public.product_refunds
  WHERE order_item_id = v_item.id
    AND status = 'approved'
    AND id <> v_refund.id;

  IF v_prior_refund + v_refund.quantity > v_item.quantity THEN
    RAISE EXCEPTION 'Total refund melebihi jumlah yang dipesan';
  END IF;

  v_code := 'REF-' || replace(v_refund.refund_code, 'REF-', '');

  INSERT INTO public.financial_transactions (
    transaction_code, transaction_type, amount, transaction_at,
    payment_method, description, reference_code, status, created_by
  )
  VALUES (
    v_code, 'expense', v_refund.amount, now(),
    'other', 'Refund produk untuk order ' || v_order.order_code,
    v_refund.refund_code, 'posted', auth.uid()
  )
  RETURNING id INTO v_transaction_id;

  UPDATE public.products
  SET current_stock = current_stock + v_refund.quantity, updated_at = now()
  WHERE id = v_item.product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk detail order tidak ditemukan';
  END IF;

  INSERT INTO public.stock_movements (
    product_id, movement_type, quantity, unit_cost, reference_code,
    reason, notes, created_by
  )
  VALUES (
    v_item.product_id, 'customer_return_in', v_refund.quantity,
    v_item.unit_price, v_refund.refund_code,
    'Refund produk disetujui', 'Stok dan buku keuangan diperbarui atomik',
    auth.uid()
  );

  UPDATE public.product_refunds
  SET status = 'approved',
      posted_transaction_id = v_transaction_id,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_refund_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_product_refund(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_product_refund(uuid) TO authenticated;
