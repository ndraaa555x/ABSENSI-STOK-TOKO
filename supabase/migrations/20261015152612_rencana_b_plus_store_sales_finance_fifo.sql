-- Store sales now post into the store ledger and consume cost batches FIFO.
alter table public.offline_store_finance_entries
  drop constraint if exists offline_store_finance_entries_entry_type_check;
alter table public.offline_store_finance_entries
  add constraint offline_store_finance_entries_entry_type_check
  check (entry_type = any(array['purchase_expense','purchase_payment','sale_income','cogs_expense']));

drop policy if exists offline_sales_read on public.offline_store_sales;
create policy offline_sales_read on public.offline_store_sales
for select to authenticated
using (cashier_id=auth.uid() or private.offline_store_member(store_id,array['manager','inventory']));
drop policy if exists offline_sale_items_read on public.offline_store_sale_items;
create policy offline_sale_items_read on public.offline_store_sale_items
for select to authenticated
using (exists (
  select 1 from public.offline_store_sales s
  where s.id=offline_store_sale_items.sale_id
    and (s.cashier_id=auth.uid() or private.offline_store_member(s.store_id,array['manager','inventory']))
));

create or replace function public.complete_offline_store_sale(
  p_store_id uuid,p_sale_code text,p_items jsonb,
  p_payment_method text default 'cash',p_discount_percent numeric default 0
)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_sale_id uuid; v_item jsonb; v_product public.offline_store_products%rowtype; v_batch record;
  v_subtotal numeric(14,2):=0; v_discount numeric(14,2):=0; v_line_discount numeric(14,2);
  v_qty numeric(14,3); v_need numeric(14,3); v_take numeric(14,3); v_price numeric(14,2);
  v_cost_total numeric(14,2); v_unit_cost numeric(14,2); v_cogs_total numeric(14,2):=0;
  v_allowed numeric(5,2); v_role text; v_line_total numeric(14,2);
begin
  if auth.uid() is null or not private.offline_store_member(p_store_id,array['manager','cashier']) then raise exception 'Akses kasir tidak diizinkan'; end if;
  if coalesce(trim(p_sale_code),'')='' or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Transaksi harus memiliki kode dan item'; end if;
  if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'store_product_id') from jsonb_array_elements(p_items)) then raise exception 'Produk yang sama tidak boleh dimasukkan dua kali dalam satu transaksi'; end if;
  if p_payment_method not in ('cash','bank_transfer','e_wallet','card','other') then raise exception 'Metode pembayaran tidak valid'; end if;
  select m.store_role into v_role from public.offline_store_memberships m where m.store_id=p_store_id and m.user_id=auth.uid() and m.is_active;
  if private.is_admin_or_owner() then v_role:='manager'; end if;
  select case when v_role in ('manager','store_admin') then manager_max_percent else cashier_max_percent end into v_allowed
    from public.offline_store_discount_policies where store_id=p_store_id;
  v_allowed:=coalesce(v_allowed,case when v_role in ('manager','store_admin') then 15 else 5 end);
  if coalesce(p_discount_percent,0)<0 or p_discount_percent>v_allowed then raise exception 'Diskon melebihi batas peran Anda (maksimal %)',v_allowed; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=coalesce((v_item->>'quantity')::numeric,0);
    select * into v_product from public.offline_store_products where id=(v_item->>'store_product_id')::uuid and store_id=p_store_id and is_active for update;
    if not found then raise exception 'Produk tidak ditemukan atau tidak aktif'; end if;
    if v_qty<=0 or v_product.current_stock<v_qty then raise exception 'Stok tidak cukup untuk produk %',v_product.name; end if;
    v_subtotal:=v_subtotal+round(v_qty*v_product.sale_price,2);
    v_discount:=v_discount+round(v_qty*v_product.sale_price*coalesce(p_discount_percent,0)/100,2);
  end loop;
  insert into public.offline_store_sales(store_id,sale_code,subtotal,discount_total,total,payment_method,cashier_id)
  values(p_store_id,trim(p_sale_code),v_subtotal,v_discount,v_subtotal-v_discount,p_payment_method,auth.uid()) returning id into v_sale_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'quantity')::numeric;
    select * into v_product from public.offline_store_products where id=(v_item->>'store_product_id')::uuid and store_id=p_store_id for update;
    v_price:=v_product.sale_price; v_need:=v_qty; v_cost_total:=0;
    for v_batch in select b.id,b.quantity_remaining,b.unit_cost from public.offline_product_cost_batches b
      where b.store_product_id=v_product.id and b.quantity_remaining>0 order by b.received_at,b.id for update
    loop
      exit when v_need<=0;
      v_take:=least(v_need,v_batch.quantity_remaining);
      v_cost_total:=v_cost_total+(v_take*v_batch.unit_cost); v_need:=v_need-v_take;
      update public.offline_product_cost_batches set quantity_remaining=quantity_remaining-v_take where id=v_batch.id;
    end loop;
    if v_need>0 then raise exception 'Riwayat harga modal tidak mencukupi untuk produk %. Catat penerimaan stok beserta harga modal terlebih dahulu.',v_product.name; end if;
    v_unit_cost:=case when v_qty>0 then round(v_cost_total/v_qty,2) else 0 end;
    v_line_discount:=round(v_qty*v_price*coalesce(p_discount_percent,0)/100,2);
    v_line_total:=round(v_qty*v_price,2)-v_line_discount;
    insert into public.offline_store_sale_items(sale_id,store_product_id,product_name,quantity,unit_price,discount_amount,unit_cost_snapshot,line_total)
    values(v_sale_id,v_product.id,v_product.name,v_qty,v_price,v_line_discount,v_unit_cost,v_line_total);
    update public.offline_store_products set current_stock=current_stock-v_qty,updated_at=now() where id=v_product.id;
    v_cogs_total:=v_cogs_total+v_cost_total;
    if v_product.central_product_id is not null then
      insert into public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by)
      values(v_product.central_product_id,'sale_out',v_qty,v_unit_cost,trim(p_sale_code),'Penjualan kasir toko offline',v_product.name,auth.uid());
    end if;
  end loop;
  if (v_subtotal-v_discount)>0 then
    insert into public.offline_store_finance_entries(store_id,entry_type,amount,payment_method,description,reference_code,created_by)
    values(p_store_id,'sale_income',v_subtotal-v_discount,p_payment_method,'Pendapatan penjualan toko offline',trim(p_sale_code),auth.uid());
  end if;
  if v_cogs_total>0 then
    insert into public.offline_store_finance_entries(store_id,entry_type,amount,description,reference_code,created_by)
    values(p_store_id,'cogs_expense',v_cogs_total,'Harga pokok barang terjual (FIFO)',trim(p_sale_code),auth.uid());
  end if;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
  values(auth.uid(),'sale','offline_store_sales',v_sale_id::text,jsonb_build_object('store_id',p_store_id,'sale_code',trim(p_sale_code),'subtotal',v_subtotal,'discount',v_discount,'total',v_subtotal-v_discount,'cogs',v_cogs_total));
  return v_sale_id;
end
$function$;
