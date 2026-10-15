-- Enforce positive sale prices at the table boundary as well as in RPC validation.
alter table public.offline_store_products
  add constraint offline_store_products_sale_price_positive check (sale_price > 0) not valid;
alter table public.offline_store_products validate constraint offline_store_products_sale_price_positive;
alter table public.offline_product_submissions
  add constraint offline_product_submissions_sale_price_positive check (proposed_sale_price > 0) not valid;
alter table public.offline_product_submissions validate constraint offline_product_submissions_sale_price_positive;
