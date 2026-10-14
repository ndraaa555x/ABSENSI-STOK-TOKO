drop policy if exists financial_transactions_admin_own_select on public.financial_transactions;
create policy financial_transactions_admin_own_select on public.financial_transactions for select to authenticated using ((select private.is_admin_or_owner()) and created_by=(select auth.uid()));
create unique index if not exists product_order_item_one_product_per_order_idx on public.product_order_items(order_id,product_id);
create or replace function public.validate_product_order_item() returns trigger language plpgsql security invoker set search_path=public,private as $$
declare v_order public.product_orders%rowtype; declare v_product public.products%rowtype;
begin
select * into v_order from public.product_orders where id=new.order_id;
if not found or v_order.status<>'pending' then raise exception 'Detail hanya dapat ditambahkan pada order yang menunggu'; end if;
if v_order.ordered_by<>auth.uid() and not private.is_admin_or_owner() then raise exception 'Order bukan milik akun ini'; end if;
select * into v_product from public.products where id=new.product_id;
if not found or not v_product.is_active then raise exception 'Produk tidak aktif atau tidak ditemukan'; end if;
if new.unit_price<>v_product.sale_price then raise exception 'Harga order harus mengikuti harga produk yang berlaku'; end if;
if new.quantity<=0 or new.quantity>v_product.current_stock then raise exception 'Jumlah order melebihi stok yang tersedia'; end if;
new.line_total:=new.quantity*new.unit_price; return new;
end; $$;
drop trigger if exists validate_product_order_item_before_write on public.product_order_items;
create trigger validate_product_order_item_before_write before insert or update on public.product_order_items for each row execute function public.validate_product_order_item();
create or replace function public.submit_product_refund(p_order_id uuid,p_order_item_id uuid,p_quantity numeric,p_reason text) returns table(refund_id uuid,refund_code text) language plpgsql security invoker set search_path=public,private as $$
declare v_order public.product_orders%rowtype; declare v_item public.product_order_items%rowtype; declare v_used numeric; declare v_code text; declare v_refund_id uuid;
begin
if not private.is_active_user() then raise exception 'Akun tidak aktif'; end if;
if p_quantity is null or p_quantity<=0 or coalesce(trim(p_reason),'')='' then raise exception 'Jumlah dan alasan refund wajib diisi'; end if;
select * into v_order from public.product_orders where id=p_order_id and ordered_by=auth.uid() and status in ('approved','fulfilled') for update;
if not found then raise exception 'Order bukan milik akun ini atau belum memenuhi syarat refund'; end if;
select * into v_item from public.product_order_items where id=p_order_item_id and order_id=p_order_id for update;
if not found then raise exception 'Produk tidak cocok dengan order yang dipilih'; end if;
select coalesce(sum(quantity),0) into v_used from public.product_refunds where order_item_id=p_order_item_id and status in ('pending','approved');
if v_used+p_quantity>v_item.quantity then raise exception 'Jumlah refund melebihi sisa jumlah yang dapat direfund'; end if;
v_code:='REF-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
insert into public.product_refunds(refund_code,order_id,order_item_id,requested_by,quantity,amount,reason) values(v_code,p_order_id,p_order_item_id,auth.uid(),p_quantity,p_quantity*v_item.unit_price,trim(p_reason)) returning id into v_refund_id;
return query select v_refund_id,v_code;
end; $$;
grant execute on function public.submit_product_refund(uuid,uuid,numeric,text) to authenticated;
