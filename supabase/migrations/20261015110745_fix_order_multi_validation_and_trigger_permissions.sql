REVOKE EXECUTE ON FUNCTION public.post_order_finance_on_approval() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_product_order_multi(
  p_items jsonb,
  p_notes text DEFAULT NULL::text,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_payment_method text DEFAULT 'other'::text,
  p_payment_evidence_path text DEFAULT NULL::text
)
RETURNS TABLE(order_id uuid, order_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_order_id uuid;
  v_code text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity numeric;
  v_count integer := 0;
  v_seen_product_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_active_user() THEN
    RAISE EXCEPTION 'Akun tidak aktif atau belum memiliki akses';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Tambahkan minimal satu produk ke order';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Satu order maksimal 50 baris produk';
  END IF;
  IF coalesce(p_payment_method, '') NOT IN ('cash','bank_transfer','e_wallet','card','other') THEN
    RAISE EXCEPTION 'Metode pembayaran tidak valid';
  END IF;
  IF p_payment_evidence_path IS NOT NULL
     AND split_part(p_payment_evidence_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Lokasi bukti pembayaran tidak valid';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.business_customers c
    WHERE c.id = p_customer_id
      AND c.is_active = true
      AND (c.created_by = auth.uid() OR private.is_admin_or_owner())
  ) THEN
    RAISE EXCEPTION 'Data toko/pembeli tidak ditemukan atau tidak dapat diakses';
  END IF;

  -- Validate every item, reject duplicate product IDs, and lock stock rows before writing.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Format item order tidak valid';
    END IF;

    v_product_id := nullif(trim(v_item->>'product_id'), '')::uuid;
    v_quantity := nullif(trim(v_item->>'quantity'), '')::numeric;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Produk dan jumlah setiap item wajib valid; jumlah harus lebih dari nol';
    END IF;
    IF v_product_id = ANY(v_seen_product_ids) THEN
      RAISE EXCEPTION 'Produk yang sama tidak boleh muncul lebih dari sekali dalam satu order';
    END IF;
    v_seen_product_ids := array_append(v_seen_product_ids, v_product_id);

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produk tidak ditemukan atau sudah dinonaktifkan';
    END IF;
    IF v_quantity > v_product.current_stock THEN
      RAISE EXCEPTION 'Stok % tersedia hanya % %',
        v_product.name, v_product.current_stock, v_product.unit;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  v_code := 'ORD-' || to_char(now(),'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  INSERT INTO public.product_orders(
    order_code, ordered_by, notes, customer_id, payment_method,
    payment_evidence_path, stock_reserved
  )
  VALUES (
    v_code, auth.uid(), nullif(trim(p_notes),''), p_customer_id,
    p_payment_method, p_payment_evidence_path, true
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id AND is_active = true
    FOR UPDATE;

    INSERT INTO public.product_order_items(
      order_id, product_id, quantity, unit_price, line_total
    )
    VALUES (
      v_order_id, v_product.id, v_quantity,
      v_product.sale_price, v_quantity * v_product.sale_price
    );

    UPDATE public.products
    SET current_stock = current_stock - v_quantity, updated_at = now()
    WHERE id = v_product.id;

    INSERT INTO public.stock_movements(
      product_id, movement_type, quantity, unit_cost, reference_code,
      reason, notes, created_by
    )
    VALUES (
      v_product.id, 'internal_out', v_quantity, NULL, v_code,
      'Stok dicadangkan saat order karyawan masuk',
      'Reservasi otomatis; jika order ditolak, stok dikembalikan otomatis',
      auth.uid()
    );
  END LOOP;

  RETURN QUERY SELECT v_order_id, v_code;
END;
$function$;
