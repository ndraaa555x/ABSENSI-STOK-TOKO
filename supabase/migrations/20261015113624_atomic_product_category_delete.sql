CREATE OR REPLACE FUNCTION public.delete_product_category(p_category_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin_or_owner() THEN
    RAISE EXCEPTION 'Hanya Admin/Owner aktif yang dapat menghapus kategori produk';
  END IF;
  PERFORM 1 FROM public.product_categories WHERE id = p_category_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kategori produk tidak ditemukan';
  END IF;
  UPDATE public.products SET category_id = NULL, updated_at = now() WHERE category_id = p_category_id;
  DELETE FROM public.product_categories WHERE id = p_category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kategori produk gagal dihapus';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_product_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_product_category(uuid) TO authenticated;
