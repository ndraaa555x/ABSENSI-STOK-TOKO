create or replace function public.submit_product_order(p_product_id uuid,p_quantity numeric,p_notes text default null) returns table(order_id uuid,order_code text) language plpgsql security invoker set search_path=public,private as $$
declare v_product public.products%rowtype; declare v_order_id uuid; declare v_code text;
begin
if not private.is_active_user() then raise exception 'Akun tidak aktif'; end if;
if p_quantity is null or p_quantity<=0 then raise exception 'Jumlah order harus lebih dari nol'; end if;
select * into v_product from public.products where id=p_product_id and is_active=true for update;
if not found then raise exception 'Produk tidak tersedia'; end if;
if p_quantity>v_product.current_stock then raise exception 'Jumlah order melebihi stok saat ini'; end if;
v_code:='ORD-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
insert into public.product_orders(order_code,ordered_by,notes) values(v_code,auth.uid(),nullif(trim(p_notes),'')) returning id into v_order_id;
insert into public.product_order_items(order_id,product_id,quantity,unit_price,line_total) values(v_order_id,v_product.id,p_quantity,v_product.sale_price,p_quantity*v_product.sale_price);
return query select v_order_id,v_code;
end; $$;
grant execute on function public.submit_product_order(uuid,numeric,text) to authenticated;
create or replace function public.approve_financial_report(p_report_id uuid) returns void language plpgsql security invoker set search_path=public,private as $$
declare v_report public.financial_reports%rowtype; declare v_code text; declare v_transaction_id uuid;
begin
if not private.is_admin_or_owner() then raise exception 'Hanya Admin/Owner yang dapat memeriksa laporan'; end if;
select * into v_report from public.financial_reports where id=p_report_id for update;
if not found then raise exception 'Laporan tidak ditemukan'; end if;
if v_report.status<>'pending' or v_report.posted_transaction_id is not null then raise exception 'Laporan ini sudah pernah diproses'; end if;
v_code:='RPT-'||replace(v_report.report_code,'LAP-','');
insert into public.financial_transactions(transaction_code,transaction_type,amount,transaction_at,payment_method,description,reference_code,status,created_by) values(v_code,v_report.report_type,v_report.amount,v_report.created_at,v_report.payment_method,v_report.description,coalesce(v_report.reference_code,v_report.report_code),'posted',auth.uid()) returning id into v_transaction_id;
update public.financial_reports set status='approved',posted_transaction_id=v_transaction_id,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_report_id;
end; $$;
create or replace function public.approve_product_refund(p_refund_id uuid) returns void language plpgsql security invoker set search_path=public,private as $$
declare v_refund public.product_refunds%rowtype; declare v_item public.product_order_items%rowtype; declare v_order public.product_orders%rowtype; declare v_code text; declare v_transaction_id uuid; declare v_prior_refund numeric;
begin
if not private.is_admin_or_owner() then raise exception 'Hanya Admin/Owner yang dapat memeriksa refund'; end if;
select * into v_refund from public.product_refunds where id=p_refund_id for update;
if not found then raise exception 'Refund tidak ditemukan'; end if;
if v_refund.status<>'pending' or v_refund.posted_transaction_id is not null then raise exception 'Refund ini sudah pernah diproses'; end if;
select * into v_item from public.product_order_items where id=v_refund.order_item_id for update;
if not found then raise exception 'Detail order tidak ditemukan'; end if;
select * into v_order from public.product_orders where id=v_refund.order_id for update;
if not found or v_order.status not in ('approved','fulfilled') then raise exception 'Order asal tidak valid untuk refund'; end if;
if v_item.order_id<>v_refund.order_id or v_refund.quantity>v_item.quantity then raise exception 'Jumlah refund melebihi detail order'; end if;
select coalesce(sum(quantity),0) into v_prior_refund from public.product_refunds where order_item_id=v_item.id and status='approved';
if v_prior_refund+v_refund.quantity>v_item.quantity then raise exception 'Total refund melebihi jumlah yang dipesan'; end if;
v_code:='REF-'||replace(v_refund.refund_code,'REF-','');
insert into public.financial_transactions(transaction_code,transaction_type,amount,transaction_at,payment_method,description,reference_code,status,created_by) values(v_code,'expense',v_refund.amount,now(),'other','Refund produk untuk order '||v_order.order_code,v_refund.refund_code,'posted',auth.uid()) returning id into v_transaction_id;
update public.products set current_stock=current_stock+v_refund.quantity,updated_at=now() where id=v_item.product_id;
insert into public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by) values(v_item.product_id,'customer_return_in',v_refund.quantity,v_item.unit_price,v_refund.refund_code,'Refund produk disetujui','Stok dan buku keuangan diperbarui atomik',auth.uid());
update public.product_refunds set status='approved',posted_transaction_id=v_transaction_id,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_refund_id;
end; $$;
