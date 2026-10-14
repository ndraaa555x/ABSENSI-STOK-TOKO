-- ROLLBACK SNAPSHOT captured from production on 2026-10-14.
-- Do not run unless the new migration has been applied and verified to fail.
-- This restores the prior function body and prior EXECUTE grants; it restores no business data.
CREATE OR REPLACE FUNCTION public.approve_product_refund(p_refund_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'private'
AS $function$
declare v_refund public.product_refunds%rowtype;
declare v_item public.product_order_items%rowtype;
declare v_order public.product_orders%rowtype;
declare v_code text;
declare v_transaction_id uuid;
declare v_prior_refund numeric;
begin
  if not private.is_admin_or_owner() then
    raise exception 'Hanya Admin/Owner yang dapat memeriksa refund';
  end if;
  select * into v_refund from public.product_refunds where id=p_refund_id for update;
  if not found then raise exception 'Refund tidak ditemukan'; end if;
  if v_refund.status<>'pending' or v_refund.posted_transaction_id is not null then
    raise exception 'Refund ini sudah pernah diproses';
  end if;
  select * into v_item from public.product_order_items where id=v_refund.order_item_id for update;
  if not found then raise exception 'Detail order tidak ditemukan'; end if;
  select * into v_order from public.product_orders where id=v_refund.order_id for update;
  if not found or v_order.status not in ('approved','fulfilled') then
    raise exception 'Order asal tidak valid untuk refund';
  end if;
  if v_item.order_id<>v_refund.order_id or v_refund.quantity>v_item.quantity then
    raise exception 'Jumlah refund melebihi detail order';
  end if;
  select coalesce(sum(quantity),0) into v_prior_refund
  from public.product_refunds
  where order_item_id=v_item.id and status='approved' and id<>v_refund.id;
  if v_prior_refund+v_refund.quantity>v_item.quantity then
    raise exception 'Total refund melebihi jumlah yang dipesan';
  end if;
  v_code:='REF-'||replace(v_refund.refund_code,'REF-','');
  insert into public.financial_transactions(transaction_code,transaction_type,amount,transaction_at,payment_method,description,reference_code,status,created_by)
  values(v_code,'expense',v_refund.amount,now(),'other','Refund produk untuk order '||v_order.order_code,v_refund.refund_code,'posted',auth.uid())
  returning id into v_transaction_id;
  update public.products set current_stock=current_stock+v_refund.quantity,updated_at=now() where id=v_item.product_id;
  insert into public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by)
  values(v_item.product_id,'customer_return_in',v_refund.quantity,v_item.unit_price,v_refund.refund_code,'Refund produk disetujui','Stok dan buku keuangan diperbarui atomik',auth.uid());
  update public.product_refunds set status='approved',posted_transaction_id=v_transaction_id,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_refund_id;
end;
$function$;

-- Previous production grants observed before the fix:
GRANT EXECUTE ON FUNCTION public.approve_product_refund(uuid) TO PUBLIC, anon, authenticated, postgres, service_role;
