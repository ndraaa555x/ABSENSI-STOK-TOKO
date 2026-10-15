-- Harden store operations: clients may read scoped data but must use validated RPCs for writes.
drop policy if exists offline_store_products_write on public.offline_store_products;
revoke insert, update, delete, truncate, references, trigger on public.offline_store_products from anon, authenticated, public;

revoke insert, update, delete, truncate, references, trigger on public.offline_stock_receipts from anon, authenticated, public;
drop policy if exists offline_receipts_update on public.offline_stock_receipts;

revoke insert, update, delete, truncate, references, trigger on public.offline_stock_receipt_items from anon, authenticated, public;
drop policy if exists offline_receipt_items_insert on public.offline_stock_receipt_items;

revoke insert, update, delete, truncate, references, trigger on public.offline_product_cost_batches from anon, authenticated, public;
drop policy if exists offline_cost_batches_insert on public.offline_product_cost_batches;

revoke insert, update, delete, truncate, references, trigger on public.offline_store_discount_policies from anon, authenticated, public;
drop policy if exists offline_discount_policy_write on public.offline_store_discount_policies;

revoke insert, update, delete, truncate, references, trigger on public.offline_store_discounts from anon, authenticated, public;
drop policy if exists offline_discounts_write on public.offline_store_discounts;

revoke insert, update, delete, truncate, references, trigger on public.offline_product_submissions from anon, authenticated, public;
drop policy if exists offline_submissions_insert on public.offline_product_submissions;
drop policy if exists offline_submissions_admin_update on public.offline_product_submissions;

revoke insert, update, delete, truncate, references, trigger on public.offline_store_categories from anon, authenticated, public;

-- Purchase details contain unit cost; cashiers do not need access.
drop policy if exists offline_purchase_orders_read on public.offline_store_purchase_orders;
create policy offline_purchase_orders_read on public.offline_store_purchase_orders
for select to authenticated
using ((select private.is_admin_or_owner()) or private.offline_store_member(store_id, array['manager','store_admin','inventory']));

drop policy if exists offline_purchase_items_read on public.offline_store_purchase_items;
create policy offline_purchase_items_read on public.offline_store_purchase_items
for select to authenticated
using (exists (
  select 1 from public.offline_store_purchase_orders o
  where o.id = offline_store_purchase_items.order_id
    and ((select private.is_admin_or_owner()) or private.offline_store_member(o.store_id, array['manager','store_admin','inventory']))
));

-- Warehouse staff need stock tools, not sales/payment details.
drop policy if exists offline_sales_read on public.offline_store_sales;
create policy offline_sales_read on public.offline_store_sales
for select to authenticated
using (cashier_id = (select auth.uid()) or private.offline_store_member(store_id, array['manager','store_admin']));

drop policy if exists offline_sale_items_read on public.offline_store_sale_items;
create policy offline_sale_items_read on public.offline_store_sale_items
for select to authenticated
using (exists (
  select 1 from public.offline_store_sales s
  where s.id = offline_store_sale_items.sale_id
    and (s.cashier_id = (select auth.uid()) or private.offline_store_member(s.store_id, array['manager','store_admin']))
));

-- Receipt data contains unit costs; scope it to staff who handle stock.
drop policy if exists offline_receipts_read on public.offline_stock_receipts;
create policy offline_receipts_read on public.offline_stock_receipts
for select to authenticated
using (private.offline_store_member(store_id, array['manager','store_admin','inventory']));

drop policy if exists offline_receipt_items_read on public.offline_stock_receipt_items;
create policy offline_receipt_items_read on public.offline_stock_receipt_items
for select to authenticated
using (exists (
  select 1 from public.offline_stock_receipts r
  where r.id = offline_stock_receipt_items.receipt_id
    and private.offline_store_member(r.store_id, array['manager','store_admin','inventory'])
));

-- Remove default execute from public/anonymous callers; keep authenticated access to
-- non-definer functions and only explicitly approved SECURITY DEFINER RPCs.
do $$
declare f record;
begin
  for f in
    select p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %I.%I(%s) from anon, public', f.nspname, f.proname, f.args);
    if not f.prosecdef and f.proname <> 'post_order_finance_on_approval' then
      execute format('grant execute on function %I.%I(%s) to authenticated', f.nspname, f.proname, f.args);
    end if;
  end loop;
end $$;

grant execute on function public.assign_offline_store_member(uuid,uuid,text,boolean) to authenticated;
grant execute on function public.complete_offline_store_sale(uuid,text,jsonb,text,numeric) to authenticated;
grant execute on function public.create_offline_discount(uuid,text,text,numeric,uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.create_offline_local_product(uuid,text,text,text,text,text,text,numeric,numeric) to authenticated;
grant execute on function public.create_offline_stock_receipt(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.create_offline_store(text,text,text) to authenticated;
grant execute on function public.create_offline_store_purchase(uuid,jsonb,text) to authenticated;
grant execute on function public.deactivate_offline_store_job_title(uuid) to authenticated;
grant execute on function public.list_offline_store_members(uuid) to authenticated;
grant execute on function public.manage_offline_store_member(uuid,text,uuid,boolean) to authenticated;
grant execute on function public.pay_offline_store_purchase(uuid,numeric,text) to authenticated;
grant execute on function public.receive_offline_stock(uuid) to authenticated;
grant execute on function public.receive_offline_store_purchase(uuid) to authenticated;
grant execute on function public.reject_offline_store_purchase(uuid,text) to authenticated;
grant execute on function public.review_offline_product_submission(uuid,text,text,boolean) to authenticated;
grant execute on function public.save_offline_discount_policy(uuid,numeric,numeric,boolean) to authenticated;
grant execute on function public.save_offline_store_job_title(uuid,text,text,uuid) to authenticated;
grant execute on function public.ship_offline_store_purchase(uuid) to authenticated;
grant execute on function public.submit_offline_product(uuid,text,text,text,text,uuid,text,text,numeric) to authenticated;
grant execute on function public.update_offline_store_team_attendance(uuid,text,text) to authenticated;

-- Require positive prices for store-created and submitted products.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.create_offline_local_product(uuid,text,text,text,text,text,text,numeric,numeric)'::regprocedure) into v_def;
  if position('coalesce(p_sale_price,-1)<0' in v_def)=0 then raise exception 'Local-product price validation not found'; end if;
  execute replace(v_def, 'coalesce(p_sale_price,-1)<0', 'coalesce(p_sale_price,0)<=0');

  select pg_get_functiondef('public.submit_offline_product(uuid,text,text,text,text,uuid,text,text,numeric)'::regprocedure) into v_def;
  if position('coalesce(p_sale_price,-1)<0' in v_def)=0 then raise exception 'Submission price validation not found'; end if;
  execute replace(v_def, 'coalesce(p_sale_price,-1)<0', 'coalesce(p_sale_price,0)<=0');

  select pg_get_functiondef('public.review_offline_product_submission(uuid,text,text,boolean)'::regprocedure) into v_def;
  if position('v.proposed_description,0,0,0,true,auth.uid()' in v_def)=0 then raise exception 'Catalog price assignment not found'; end if;
  execute replace(v_def, 'v.proposed_description,0,0,0,true,auth.uid()', 'v.proposed_description,v.proposed_sale_price,0,0,0,true,auth.uid()');

  select pg_get_functiondef('public.save_offline_discount_policy(uuid,numeric,numeric,boolean)'::regprocedure) into v_def;
  if position('if p_cashier_max_percent<0' in v_def)=0 then raise exception 'Discount policy validation not found'; end if;
  execute replace(v_def, 'if p_cashier_max_percent<0',
    'if coalesce(p_approval_above_manager,false) then raise exception ''Persetujuan diskon di atas batas Manajer belum tersedia. Matikan opsi ini terlebih dahulu.''; end if; if p_cashier_max_percent<0');
end $$;

-- Promo activation only changes the active flag and is always audited.
create or replace function public.set_offline_discount_active(p_discount_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_store_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  select d.store_id, d.name into v_store_id, v_name
  from public.offline_store_discounts d where d.id = p_discount_id for update;
  if not found then raise exception 'Promo tidak ditemukan'; end if;
  if not private.offline_store_member(v_store_id, array['manager']) then
    raise exception 'Hanya Manajer Toko atau Owner/Admin yang dapat mengubah status promo';
  end if;
  update public.offline_store_discounts set is_active = p_is_active where id = p_discount_id;
  insert into public.audit_logs(actor_id, action, entity_table, entity_id, details)
  values(auth.uid(), case when p_is_active then 'activate' else 'deactivate' end,
    'offline_store_discounts', p_discount_id::text,
    jsonb_build_object('store_id', v_store_id, 'name', v_name, 'is_active', p_is_active));
end
$function$;
revoke execute on function public.set_offline_discount_active(uuid,boolean) from anon, public;
grant execute on function public.set_offline_discount_active(uuid,boolean) to authenticated;
