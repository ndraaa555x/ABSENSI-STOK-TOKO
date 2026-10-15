CREATE OR REPLACE FUNCTION public.save_product_with_stock(
  p_product_id uuid,
  p_sku text,
  p_barcode_value text,
  p_name text,
  p_category_id uuid,
  p_unit text,
  p_description text,
  p_sale_price numeric,
  p_cost_price numeric,
  p_target_stock numeric,
  p_minimum_stock numeric,
  p_storage_location text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_product_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin_or_owner() THEN
    RAISE EXCEPTION 'Hanya Admin/Owner aktif yang dapat mengelola produk';
  END IF;
  IF coalesce(trim(p_sku), '') = '' OR coalesce(trim(p_barcode_value), '') = '' OR coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'SKU, barcode, dan nama produk wajib diisi';
  END IF;
  IF p_sale_price IS NULL OR p_sale_price < 0 OR p_cost_price IS NULL OR p_cost_price < 0
     OR p_target_stock IS NULL OR p_target_stock < 0 OR p_minimum_stock IS NULL OR p_minimum_stock < 0 THEN
    RAISE EXCEPTION 'Harga dan stok tidak boleh kosong atau negatif';
  END IF;

  IF p_product_id IS NULL THEN
    v_product_id := public.create_product_with_stock(
      p_sku, p_barcode_value, p_name, p_category_id, p_unit, p_description,
      p_sale_price, p_target_stock, p_minimum_stock, p_storage_location
    );
  ELSE
    UPDATE public.products
       SET sku = trim(p_sku),
           barcode_value = trim(p_barcode_value),
           name = trim(p_name),
           category_id = p_category_id,
           unit = coalesce(nullif(trim(p_unit), ''), 'pcs'),
           description = nullif(trim(p_description), ''),
           sale_price = p_sale_price,
           minimum_stock = p_minimum_stock,
           storage_location = nullif(trim(p_storage_location), ''),
           updated_at = now()
     WHERE id = p_product_id
     RETURNING id INTO v_product_id;
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Produk tidak ditemukan atau tidak dapat diperbarui';
    END IF;
    PERFORM private.set_product_stock(v_product_id, p_target_stock, 'Penyesuaian stok melalui edit produk');
  END IF;

  INSERT INTO public.product_costs(product_id, cost_price, updated_by, updated_at)
  VALUES (v_product_id, p_cost_price, auth.uid(), now())
  ON CONFLICT (product_id) DO UPDATE
    SET cost_price = EXCLUDED.cost_price,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

  RETURN v_product_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_product_with_stock(uuid,text,text,text,uuid,text,text,numeric,numeric,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_with_stock(uuid,text,text,text,uuid,text,text,numeric,numeric,numeric,numeric,text) TO authenticated;
