-- Fix notification categories used by business workflow triggers.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type = ANY (ARRAY['info','warning','success','error','order','refund','finance','leave','customer']));
CREATE TABLE IF NOT EXISTS public.business_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text NOT NULL UNIQUE,
  store_name text NOT NULL,
  owner_name text,
  phone text,
  email text,
  address text,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_customers_created_by_idx ON public.business_customers(created_by);
CREATE INDEX IF NOT EXISTS business_customers_store_name_idx ON public.business_customers(store_name);
ALTER TABLE public.business_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_customers_select_scoped ON public.business_customers;
CREATE POLICY business_customers_select_scoped ON public.business_customers FOR SELECT TO authenticated USING (created_by=(SELECT auth.uid()) OR (SELECT private.is_admin_or_owner()));
DROP POLICY IF EXISTS business_customers_insert_active ON public.business_customers;
CREATE POLICY business_customers_insert_active ON public.business_customers FOR INSERT TO authenticated WITH CHECK (created_by=(SELECT auth.uid()) AND (SELECT private.is_active_user()));
DROP POLICY IF EXISTS business_customers_update_scoped ON public.business_customers;
CREATE POLICY business_customers_update_scoped ON public.business_customers FOR UPDATE TO authenticated USING (created_by=(SELECT auth.uid()) OR (SELECT private.is_admin_or_owner())) WITH CHECK (created_by=(SELECT auth.uid()) OR (SELECT private.is_admin_or_owner()));
ALTER TABLE public.product_orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.business_customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS product_orders_customer_id_idx ON public.product_orders(customer_id);
DROP FUNCTION IF EXISTS public.submit_product_order(uuid,numeric,text);
CREATE OR REPLACE FUNCTION public.submit_product_order(p_product_id uuid,p_quantity numeric,p_notes text DEFAULT NULL,p_customer_id uuid DEFAULT NULL)
RETURNS TABLE(order_id uuid,order_code text)
LANGUAGE plpgsql SET search_path TO 'public','private'
AS $function$
DECLARE v_product public.products%rowtype; v_order_id uuid; v_code text;
BEGIN
 IF NOT private.is_active_user() THEN RAISE EXCEPTION 'Akun tidak aktif atau belum memiliki akses'; END IF;
 IF p_quantity IS NULL OR p_quantity<=0 THEN RAISE EXCEPTION 'Jumlah order harus lebih dari nol'; END IF;
 SELECT * INTO v_product FROM public.products WHERE id=p_product_id AND is_active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan atau sudah dinonaktifkan. Muat ulang daftar produk.'; END IF;
 IF v_product.current_stock<=0 THEN RAISE EXCEPTION 'Stok produk % sedang kosong. Hubungi Admin untuk memperbarui stok.',v_product.name; END IF;
 IF p_quantity>v_product.current_stock THEN RAISE EXCEPTION 'Stok tersedia untuk % hanya % %; kurangi jumlah order atau hubungi Admin.',v_product.name,v_product.current_stock,v_product.unit; END IF;
 IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.business_customers c WHERE c.id=p_customer_id AND c.is_active=true AND (c.created_by=auth.uid() OR private.is_admin_or_owner())) THEN RAISE EXCEPTION 'Data toko/pembeli tidak ditemukan atau tidak dapat diakses'; END IF;
 v_code:='ORD-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 INSERT INTO public.product_orders(order_code,ordered_by,notes,customer_id) VALUES(v_code,auth.uid(),nullif(trim(p_notes),''),p_customer_id) RETURNING id INTO v_order_id;
 INSERT INTO public.product_order_items(order_id,product_id,quantity,unit_price,line_total) VALUES(v_order_id,v_product.id,p_quantity,v_product.sale_price,p_quantity*v_product.sale_price);
 RETURN QUERY SELECT v_order_id,v_code;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.submit_product_order(uuid,numeric,text,uuid) TO authenticated;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='business_customers') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.business_customers; END IF; END $$;
