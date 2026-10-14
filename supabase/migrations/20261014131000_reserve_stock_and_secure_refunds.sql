-- Functions for order stock reservation and refund eligibility.
DROP FUNCTION IF EXISTS public.submit_product_order(uuid,numeric,text);
DROP FUNCTION IF EXISTS public.submit_product_order(uuid,numeric,text,uuid);
CREATE OR REPLACE FUNCTION public.submit_product_order(
 p_product_id uuid,p_quantity numeric,p_notes text DEFAULT NULL,p_customer_id uuid DEFAULT NULL,
 p_payment_method text DEFAULT 'other',p_payment_evidence_path text DEFAULT NULL
) RETURNS TABLE(order_id uuid,order_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $$
DECLARE v_product public.products%rowtype; v_order_id uuid; v_code text;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_active_user() THEN RAISE EXCEPTION 'Akun tidak aktif atau belum memiliki akses'; END IF;
 IF p_quantity IS NULL OR p_quantity<=0 THEN RAISE EXCEPTION 'Jumlah order harus lebih dari nol'; END IF;
 IF coalesce(p_payment_method,'') NOT IN ('cash','bank_transfer','e_wallet','card','other') THEN RAISE EXCEPTION 'Metode pembayaran tidak valid'; END IF;
 IF p_payment_evidence_path IS NOT NULL AND split_part(p_payment_evidence_path,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'Lokasi bukti pembayaran tidak valid'; END IF;
 SELECT * INTO v_product FROM public.products WHERE id=p_product_id AND is_active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan atau sudah dinonaktifkan. Muat ulang daftar produk.'; END IF;
 IF v_product.current_stock<=0 THEN RAISE EXCEPTION 'Stok produk % sedang kosong. Hubungi Admin untuk memperbarui stok.',v_product.name; END IF;
 IF p_quantity>v_product.current_stock THEN RAISE EXCEPTION 'Stok tersedia untuk % hanya % %; kurangi jumlah order atau hubungi Admin.',v_product.name,v_product.current_stock,v_product.unit; END IF;
 IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.business_customers c WHERE c.id=p_customer_id AND c.is_active=true AND (c.created_by=auth.uid() OR private.is_admin_or_owner())) THEN RAISE EXCEPTION 'Data toko/pembeli tidak ditemukan atau tidak dapat diakses'; END IF;
 v_code:='ORD-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 INSERT INTO public.product_orders(order_code,ordered_by,notes,customer_id,payment_method,payment_evidence_path,stock_reserved)
 VALUES(v_code,auth.uid(),nullif(trim(p_notes),''),p_customer_id,p_payment_method,p_payment_evidence_path,true) RETURNING id INTO v_order_id;
 INSERT INTO public.product_order_items(order_id,product_id,quantity,unit_price,line_total) VALUES(v_order_id,v_product.id,p_quantity,v_product.sale_price,p_quantity*v_product.sale_price);
 UPDATE public.products SET current_stock=current_stock-p_quantity,updated_at=now() WHERE id=v_product.id;
 INSERT INTO public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by)
 VALUES(v_product.id,'internal_out',p_quantity,NULL,v_code,'Stok dicadangkan saat order karyawan masuk','Reservasi otomatis; jika order ditolak, stok dikembalikan otomatis',auth.uid());
 RETURN QUERY SELECT v_order_id,v_code;
END; $$;
REVOKE ALL ON FUNCTION public.submit_product_order(uuid,numeric,text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_product_order(uuid,numeric,text,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.release_rejected_order_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $$
DECLARE v_item record;
BEGIN
 IF OLD.status='pending' AND NEW.status='rejected' AND OLD.stock_reserved=true THEN
  FOR v_item IN SELECT i.product_id,i.quantity,i.unit_price FROM public.product_order_items i WHERE i.order_id=OLD.id LOOP
   UPDATE public.products SET current_stock=current_stock+v_item.quantity,updated_at=now() WHERE id=v_item.product_id;
   INSERT INTO public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by)
   VALUES(v_item.product_id,'adjustment_in',v_item.quantity,v_item.unit_price,OLD.order_code,'Pengembalian reservasi karena order ditolak','Stok reservasi order dikembalikan',coalesce(auth.uid(),OLD.ordered_by));
  END LOOP;
  NEW.stock_reserved:=false;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS release_rejected_order_stock ON public.product_orders;
CREATE TRIGGER release_rejected_order_stock BEFORE UPDATE OF status ON public.product_orders FOR EACH ROW EXECUTE FUNCTION private.release_rejected_order_stock();

CREATE OR REPLACE FUNCTION public.fulfill_product_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','private' AS $$
DECLARE v_order public.product_orders%rowtype; v_item record; v_current numeric;
BEGIN
 IF NOT private.is_admin_or_owner() THEN RAISE EXCEPTION 'Hanya Admin/Owner yang dapat memenuhi order'; END IF;
 SELECT * INTO v_order FROM public.product_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak ditemukan'; END IF;
 IF v_order.status<>'approved' THEN RAISE EXCEPTION 'Order harus berstatus disetujui sebelum dipenuhi'; END IF;
 IF NOT v_order.stock_reserved THEN
  FOR v_item IN SELECT i.*,p.name AS product_name FROM public.product_order_items i JOIN public.products p ON p.id=i.product_id ORDER BY i.product_id FOR UPDATE OF p LOOP
   SELECT current_stock INTO v_current FROM public.products WHERE id=v_item.product_id FOR UPDATE;
   IF v_current<v_item.quantity THEN RAISE EXCEPTION 'Stok tidak cukup untuk produk %',v_item.product_name; END IF;
   UPDATE public.products SET current_stock=current_stock-v_item.quantity,updated_at=now() WHERE id=v_item.product_id;
   INSERT INTO public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by)
   VALUES(v_item.product_id,'internal_out',v_item.quantity,NULL,v_order.order_code,'Pemenuhan order karyawan','Order dipenuhi secara atomik',auth.uid());
  END LOOP;
 END IF;
 UPDATE public.product_orders SET status='fulfilled',stock_reserved=false,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() WHERE id=p_order_id;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_product_refund(p_order_id uuid,p_order_item_id uuid,p_quantity numeric,p_reason text)
RETURNS TABLE(refund_id uuid,refund_code text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','private' AS $$
DECLARE v_order public.product_orders%rowtype; v_item public.product_order_items%rowtype; v_used numeric; v_code text; v_refund_id uuid;
BEGIN
 IF NOT private.is_active_user() THEN RAISE EXCEPTION 'Akun tidak aktif'; END IF;
 IF p_quantity IS NULL OR p_quantity<=0 OR coalesce(trim(p_reason),'')='' THEN RAISE EXCEPTION 'Jumlah dan alasan refund wajib diisi'; END IF;
 SELECT * INTO v_order FROM public.product_orders WHERE id=p_order_id AND ordered_by=auth.uid() AND status IN ('approved','fulfilled') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Refund hanya bisa diajukan untuk order milik akun Anda yang sudah disetujui atau dipenuhi. Periksa status order.'; END IF;
 SELECT * INTO v_item FROM public.product_order_items WHERE id=p_order_item_id AND order_id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak cocok dengan order yang dipilih'; END IF;
 SELECT coalesce(sum(quantity),0) INTO v_used FROM public.product_refunds WHERE order_item_id=p_order_item_id AND status IN ('pending','approved');
 IF v_used+p_quantity>v_item.quantity THEN RAISE EXCEPTION 'Jumlah refund melebihi sisa jumlah yang dapat direfund'; END IF;
 v_code:='REF-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 INSERT INTO public.product_refunds(refund_code,order_id,order_item_id,requested_by,quantity,amount,reason)
 VALUES(v_code,p_order_id,p_order_item_id,auth.uid(),p_quantity,p_quantity*v_item.unit_price,trim(p_reason)) RETURNING id INTO v_refund_id;
 RETURN QUERY SELECT v_refund_id,v_code;
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_product_refund(uuid,uuid,numeric,text) TO authenticated;
