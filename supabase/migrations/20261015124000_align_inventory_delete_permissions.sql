-- Align delete permissions with the existing Admin/Owner inventory controls in the UI.
DROP POLICY IF EXISTS products_owner_delete ON public.products;
CREATE POLICY products_admin_owner_delete
ON public.products FOR DELETE TO authenticated
USING ((SELECT private.is_admin_or_owner()));

DROP POLICY IF EXISTS categories_owner_delete ON public.product_categories;
CREATE POLICY categories_admin_owner_delete
ON public.product_categories FOR DELETE TO authenticated
USING ((SELECT private.is_admin_or_owner()));
