-- Align database authorization with the four store job groups exposed by the UI.
-- Store Admin can operate products/receiving, POS and store finance, but cannot
-- manage team memberships or store-wide discount policies/promotions.

drop policy if exists offline_cost_batches_insert on public.offline_product_cost_batches;
create policy offline_cost_batches_insert on public.offline_product_cost_batches
for insert to authenticated with check (
  created_by = (select auth.uid())
  and private.offline_store_member(store_id, array['manager','store_admin','inventory'])
);

drop policy if exists offline_cost_batches_read on public.offline_product_cost_batches;
create policy offline_cost_batches_read on public.offline_product_cost_batches
for select to authenticated using (
  private.offline_store_member(store_id, array['manager','store_admin','inventory'])
);

drop policy if exists offline_submissions_insert on public.offline_product_submissions;
create policy offline_submissions_insert on public.offline_product_submissions
for insert to authenticated with check (
  requested_by = (select auth.uid())
  and private.offline_store_member(store_id, array['manager','store_admin','inventory'])
);

drop policy if exists offline_submissions_read on public.offline_product_submissions;
create policy offline_submissions_read on public.offline_product_submissions
for select to authenticated using (
  (select private.is_admin_or_owner())
  or private.offline_store_member(store_id, array['manager','store_admin','inventory'])
);

drop policy if exists offline_receipt_items_insert on public.offline_stock_receipt_items;
create policy offline_receipt_items_insert on public.offline_stock_receipt_items
for insert to authenticated with check (
  exists (
    select 1 from public.offline_stock_receipts r
    where r.id = offline_stock_receipt_items.receipt_id
      and r.status = 'pending'
      and private.offline_store_member(r.store_id, array['manager','store_admin','inventory'])
  )
);

drop policy if exists offline_receipts_insert on public.offline_stock_receipts;
create policy offline_receipts_insert on public.offline_stock_receipts
for insert to authenticated with check (
  created_by = (select auth.uid())
  and private.offline_store_member(store_id, array['manager','store_admin','inventory'])
);

drop policy if exists offline_receipts_update on public.offline_stock_receipts;
create policy offline_receipts_update on public.offline_stock_receipts
for update to authenticated
using (private.offline_store_member(store_id, array['manager','store_admin','inventory']))
with check (private.offline_store_member(store_id, array['manager','store_admin','inventory']));

drop policy if exists offline_categories_write on public.offline_store_categories;
create policy offline_categories_write on public.offline_store_categories
for all to authenticated
using (private.offline_store_member(store_id, array['manager','store_admin','inventory']))
with check (private.offline_store_member(store_id, array['manager','store_admin','inventory']));

drop policy if exists offline_store_products_write on public.offline_store_products;
create policy offline_store_products_write on public.offline_store_products
for all to authenticated
using (private.offline_store_member(store_id, array['manager','store_admin','inventory']))
with check (private.offline_store_member(store_id, array['manager','store_admin','inventory']));

drop policy if exists offline_store_finance_entries_read on public.offline_store_finance_entries;
create policy offline_store_finance_entries_read on public.offline_store_finance_entries
for select to authenticated using (
  (select private.is_admin_or_owner())
  or private.offline_store_member(store_id, array['manager','store_admin'])
);

drop policy if exists offline_purchase_items_read on public.offline_store_purchase_items;
create policy offline_purchase_items_read on public.offline_store_purchase_items
for select to authenticated using (
  exists (
    select 1 from public.offline_store_purchase_orders o
    where o.id = offline_store_purchase_items.order_id
      and (
        (select private.is_admin_or_owner())
        or private.offline_store_member(o.store_id, array['manager','store_admin','inventory','cashier'])
      )
  )
);

drop policy if exists offline_purchase_orders_read on public.offline_store_purchase_orders;
create policy offline_purchase_orders_read on public.offline_store_purchase_orders
for select to authenticated using (
  (select private.is_admin_or_owner())
  or private.offline_store_member(store_id, array['manager','store_admin','inventory','cashier'])
);

drop policy if exists offline_sale_items_read on public.offline_store_sale_items;
create policy offline_sale_items_read on public.offline_store_sale_items
for select to authenticated using (
  exists (
    select 1 from public.offline_store_sales s
    where s.id = offline_store_sale_items.sale_id
      and (
        s.cashier_id = (select auth.uid())
        or private.offline_store_member(s.store_id, array['manager','store_admin','inventory'])
      )
  )
);

drop policy if exists offline_sales_read on public.offline_store_sales;
create policy offline_sales_read on public.offline_store_sales
for select to authenticated using (
  cashier_id = (select auth.uid())
  or private.offline_store_member(store_id, array['manager','store_admin','inventory'])
);

-- Update only the operational RPCs whose UI permissions already include Store Admin.
do $migration$
declare
  f record;
  v_definition text;
  v_old text := 'array[''manager'',''inventory'']';
  v_new text := 'array[''manager'',''store_admin'',''inventory'']';
begin
  for f in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_offline_local_product',
        'create_offline_stock_receipt',
        'create_offline_store_purchase',
        'receive_offline_stock',
        'receive_offline_store_purchase',
        'submit_offline_product'
      )
  loop
    v_definition := replace(f.definition, v_old, v_new);
    if v_definition = f.definition then
      raise exception 'Expected role check not found in RPC %; migration stopped', f.proname;
    end if;
    execute v_definition;
  end loop;
end;
$migration$;
