-- Restore explicit Owner/Admin read access to offline-store reporting tables.
-- This does not grant store staff access outside their own store.
-- Use the hardened SECURITY DEFINER helper to avoid membership-policy recursion.

drop policy if exists offline_sales_read on public.offline_store_sales;
create policy offline_sales_read on public.offline_store_sales
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or cashier_id = (select auth.uid())
  or private.offline_store_member(store_id, array['manager','store_admin','inventory'])
);

drop policy if exists offline_sale_items_read on public.offline_store_sale_items;
create policy offline_sale_items_read on public.offline_store_sale_items
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or exists (
    select 1 from public.offline_store_sales s
    where s.id = offline_store_sale_items.sale_id
      and (
        s.cashier_id = (select auth.uid())
        or private.offline_store_member(s.store_id, array['manager','store_admin','inventory'])
      )
  )
);

drop policy if exists offline_receipts_read on public.offline_stock_receipts;
create policy offline_receipts_read on public.offline_stock_receipts
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or private.offline_store_member(store_id, array['manager','store_admin','inventory'])
);

drop policy if exists offline_receipt_items_read on public.offline_stock_receipt_items;
create policy offline_receipt_items_read on public.offline_stock_receipt_items
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or exists (
    select 1 from public.offline_stock_receipts r
    where r.id = offline_stock_receipt_items.receipt_id
      and private.offline_store_member(r.store_id, array['manager','store_admin','inventory'])
  )
);

drop policy if exists offline_store_products_read on public.offline_store_products;
create policy offline_store_products_read on public.offline_store_products
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or private.offline_store_member(store_id, null)
);

drop policy if exists offline_categories_read on public.offline_store_categories;
create policy offline_categories_read on public.offline_store_categories
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or private.offline_store_member(store_id, null)
);

drop policy if exists offline_discount_policy_read on public.offline_store_discount_policies;
create policy offline_discount_policy_read on public.offline_store_discount_policies
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or private.offline_store_member(store_id, null)
);

drop policy if exists offline_discounts_read on public.offline_store_discounts;
create policy offline_discounts_read on public.offline_store_discounts
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or private.offline_store_member(store_id, null)
);

drop policy if exists offline_cost_batches_read on public.offline_product_cost_batches;
create policy offline_cost_batches_read on public.offline_product_cost_batches
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or private.offline_store_member(store_id, array['manager','store_admin','inventory'])
);

drop policy if exists offline_store_job_titles_read on public.offline_store_job_titles;
create policy offline_store_job_titles_read on public.offline_store_job_titles
for select to authenticated
using (
  (select private.is_admin_or_owner())
  or private.offline_store_member(store_id, null)
);
