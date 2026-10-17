-- Safe, store-scoped deletion for offline products and categories.
-- Products referenced by sales are deactivated instead of physically deleted.
create or replace function private.delete_offline_store_product(p_store_id uuid, p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_product public.offline_store_products%rowtype;
begin
  if auth.uid() is null or not private.offline_store_member(p_store_id, array['manager','store_admin','inventory']) then
    raise exception 'Hanya manager/admin toko/petugas stok yang dapat menghapus produk';
  end if;
  select * into v_product
  from public.offline_store_products
  where id = p_product_id and store_id = p_store_id
  for update;
  if not found then raise exception 'Produk tidak ditemukan di toko ini'; end if;
  if exists (select 1 from public.offline_store_sale_items i where i.store_product_id = p_product_id) then
    update public.offline_store_products set is_active = false, updated_at = now()
    where id = p_product_id and store_id = p_store_id;
  else
    -- Retain the product row for stock/cost-batch references and audit consistency.
    update public.offline_store_products set is_active = false, updated_at = now()
    where id = p_product_id and store_id = p_store_id;
  end if;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
  values(auth.uid(),'deactivate','offline_store_products',p_product_id::text,
    jsonb_build_object('store_id',p_store_id,'name',v_product.name,'sku',v_product.sku,'reason','User requested product deletion; preserved history'));
end;
$function$;
revoke all on function private.delete_offline_store_product(uuid,uuid) from public;
grant execute on function private.delete_offline_store_product(uuid,uuid) to authenticated;

create or replace function public.delete_offline_store_product(p_store_id uuid, p_product_id uuid)
returns void language sql security invoker set search_path = ''
as $function$ select private.delete_offline_store_product($1,$2); $function$;
revoke all on function public.delete_offline_store_product(uuid,uuid) from public, anon;
grant execute on function public.delete_offline_store_product(uuid,uuid) to authenticated;

create or replace function private.delete_offline_store_category(p_store_id uuid, p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_category public.offline_store_categories%rowtype;
begin
  if auth.uid() is null or not private.offline_store_member(p_store_id, array['manager','store_admin','inventory']) then
    raise exception 'Hanya manager/admin toko/petugas stok yang dapat menghapus kategori';
  end if;
  select * into v_category from public.offline_store_categories
  where id = p_category_id and store_id = p_store_id for update;
  if not found then raise exception 'Kategori tidak ditemukan di toko ini'; end if;
  update public.offline_store_products set local_category_id = null, updated_at = now()
  where store_id = p_store_id and local_category_id = p_category_id;
  delete from public.offline_store_categories where id = p_category_id and store_id = p_store_id;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
  values(auth.uid(),'delete','offline_store_categories',p_category_id::text,
    jsonb_build_object('store_id',p_store_id,'name',v_category.name,'reason','Category removed; products kept uncategorized'));
end;
$function$;
revoke all on function private.delete_offline_store_category(uuid,uuid) from public;
grant execute on function private.delete_offline_store_category(uuid,uuid) to authenticated;

create or replace function public.delete_offline_store_category(p_store_id uuid, p_category_id uuid)
returns void language sql security invoker set search_path = ''
as $function$ select private.delete_offline_store_category($1,$2); $function$;
revoke all on function public.delete_offline_store_category(uuid,uuid) from public, anon;
grant execute on function public.delete_offline_store_category(uuid,uuid) to authenticated;