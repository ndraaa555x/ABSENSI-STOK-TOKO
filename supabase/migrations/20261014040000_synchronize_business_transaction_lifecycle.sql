-- Complete the transaction lifecycle and keep inventory/ledger synchronized atomically.
alter table public.financial_reports add column if not exists posted_transaction_id uuid references public.financial_transactions(id) on delete set null;
alter table public.product_refunds add column if not exists posted_transaction_id uuid references public.financial_transactions(id) on delete set null;
create index if not exists financial_reports_posted_transaction_idx on public.financial_reports(posted_transaction_id);
create index if not exists product_refunds_posted_transaction_idx on public.product_refunds(posted_transaction_id);
create index if not exists financial_transactions_category_at_idx on public.financial_transactions(category_id, transaction_at desc);
create index if not exists stock_movements_product_at_idx on public.stock_movements(product_id, movement_at desc);
create index if not exists financial_reports_related_order_idx on public.financial_reports(related_order_id);
create index if not exists product_order_items_product_idx on public.product_order_items(product_id);
create index if not exists product_orders_reviewed_by_idx on public.product_orders(reviewed_by);
create index if not exists product_refunds_order_idx on public.product_refunds(order_id);
create index if not exists product_refunds_item_idx on public.product_refunds(order_item_id);
create index if not exists product_refunds_reviewed_by_idx on public.product_refunds(reviewed_by);
create index if not exists financial_reports_reviewed_by_idx on public.financial_reports(reviewed_by);
drop policy if exists financial_transactions_admin_post on public.financial_transactions;
create policy financial_transactions_admin_post on public.financial_transactions for insert to authenticated with check ((select private.is_admin_or_owner()) and created_by=(select auth.uid()) and status='posted');
create or replace function public.fulfill_product_order(p_order_id uuid) returns void language plpgsql security invoker set search_path=public,private as $$
declare v_order public.product_orders%rowtype; declare v_item record; declare v_current numeric;
begin
if not private.is_admin_or_owner() then raise exception 'Hanya Admin/Owner yang dapat memenuhi order'; end if;
select * into v_order from public.product_orders where id=p_order_id for update;
if not found then raise exception 'Order tidak ditemukan'; end if;
if v_order.status<>'approved' then raise exception 'Order harus berstatus disetujui sebelum dipenuhi'; end if;
for v_item in select i.*,p.name as product_name from public.product_order_items i join public.products p on p.id=i.product_id where i.order_id=p_order_id order by i.product_id for update of p loop
select current_stock into v_current from public.products where id=v_item.product_id for update;
if v_current<v_item.quantity then raise exception 'Stok tidak cukup untuk produk %',v_item.product_name; end if;
update public.products set current_stock=current_stock-v_item.quantity,updated_at=now() where id=v_item.product_id;
insert into public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by) values(v_item.product_id,'internal_out',v_item.quantity,null,v_order.order_code,'Pemenuhan order karyawan','Order dipenuhi secara atomik',auth.uid());
end loop;
update public.product_orders set status='fulfilled',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_order_id;
end; $$;
create or replace function public.approve_financial_report(p_report_id uuid) returns void language plpgsql security invoker set search_path=public,private as $$
declare v_report public.financial_reports%rowtype; declare v_code text;
begin
if not private.is_admin_or_owner() then raise exception 'Hanya Admin/Owner yang dapat memeriksa laporan'; end if;
select * into v_report from public.financial_reports where id=p_report_id for update;
if not found then raise exception 'Laporan tidak ditemukan'; end if;
if v_report.status<>'pending' or v_report.posted_transaction_id is not null then raise exception 'Laporan ini sudah pernah diproses'; end if;
v_code:='RPT-'||replace(v_report.report_code,'LAP-','');
insert into public.financial_transactions(transaction_code,transaction_type,amount,transaction_at,payment_method,description,reference_code,status,created_by) values(v_code,v_report.report_type,v_report.amount,v_report.created_at,v_report.payment_method,v_report.description,coalesce(v_report.reference_code,v_report.report_code),'posted',auth.uid());
update public.financial_reports set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_report_id;
end; $$;
create or replace function public.approve_product_refund(p_refund_id uuid) returns void language plpgsql security invoker set search_path=public,private as $$
declare v_refund public.product_refunds%rowtype; declare v_item public.product_order_items%rowtype; declare v_order public.product_orders%rowtype; declare v_code text;
begin
if not private.is_admin_or_owner() then raise exception 'Hanya Admin/Owner yang dapat memeriksa refund'; end if;
select * into v_refund from public.product_refunds where id=p_refund_id for update;
if not found then raise exception 'Refund tidak ditemukan'; end if;
if v_refund.status<>'pending' or v_refund.posted_transaction_id is not null then raise exception 'Refund ini sudah pernah diproses'; end if;
select * into v_item from public.product_order_items where id=v_refund.order_item_id for update;
select * into v_order from public.product_orders where id=v_refund.order_id for update;
if not found or v_order.status not in ('approved','fulfilled') then raise exception 'Order asal tidak valid untuk refund'; end if;
v_code:='REF-'||replace(v_refund.refund_code,'REF-','');
insert into public.financial_transactions(transaction_code,transaction_type,amount,transaction_at,payment_method,description,reference_code,status,created_by) values(v_code,'expense',v_refund.amount,now(),'other','Refund produk untuk order '||v_order.order_code,v_refund.refund_code,'posted',auth.uid());
update public.products set current_stock=current_stock+v_refund.quantity,updated_at=now() where id=v_item.product_id;
insert into public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by) values(v_item.product_id,'customer_return_in',v_refund.quantity,v_item.unit_price,v_refund.refund_code,'Refund produk disetujui','Stok dan buku keuangan diperbarui atomik',auth.uid());
update public.product_refunds set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_refund_id;
end; $$;
grant execute on function public.fulfill_product_order(uuid) to authenticated;
grant execute on function public.approve_financial_report(uuid) to authenticated;
grant execute on function public.approve_product_refund(uuid) to authenticated;
drop policy if exists leave_employee_insert_own on public.leave_requests;
create policy leave_employee_insert_own on public.leave_requests for insert to authenticated with check (status='pending' and exists(select 1 from public.employees e where e.id=employee_id and e.profile_id=(select auth.uid()) and (select private.is_active_user())));
