-- Break the RLS cycle between offline_store_memberships and offline_stores.
-- The manager predicate must not read offline_stores because its SELECT policy
-- checks offline_store_memberships again.
create or replace function private.offline_store_manager(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(exists (
    select 1
    from public.offline_store_memberships m
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and m.store_role = 'manager'
  ), false);
$function$;


-- Receive a prepared store stock receipt exactly once. Stock and FIFO cost batches
-- are created only when an authorized store user confirms physical receipt.
create or replace function public.receive_offline_stock(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_receipt public.offline_stock_receipts%rowtype;
  v_item public.offline_stock_receipt_items%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sesi login diperlukan';
  end if;

  select * into v_receipt
  from public.offline_stock_receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'Penerimaan stok tidak ditemukan';
  end if;

  if not private.offline_store_member(v_receipt.store_id, array['manager','store_admin','inventory']) then
    raise exception 'Akses penerimaan stok tidak diizinkan';
  end if;

  if v_receipt.status <> 'pending' then
    raise exception 'Penerimaan ini sudah diproses atau tidak berstatus menunggu';
  end if;

  if not exists (select 1 from public.offline_stock_receipt_items where receipt_id = p_receipt_id) then
    raise exception 'Penerimaan harus memiliki minimal satu item';
  end if;

  for v_item in
    select * from public.offline_stock_receipt_items
    where receipt_id = p_receipt_id
    order by created_at, id
    for update
  loop
    update public.offline_store_products
    set current_stock = current_stock + v_item.quantity,
        updated_at = now()
    where id = v_item.store_product_id
      and store_id = v_receipt.store_id;

    if not found then
      raise exception 'Produk penerimaan tidak cocok dengan toko';
    end if;

    insert into public.offline_product_cost_batches
      (store_id, store_product_id, receipt_item_id, quantity_received, quantity_remaining, unit_cost, received_at, created_by)
    values
      (v_receipt.store_id, v_item.store_product_id, v_item.id, v_item.quantity, v_item.quantity, v_item.unit_cost, now(), auth.uid());
  end loop;

  update public.offline_stock_receipts
  set status = 'received', received_by = auth.uid(), received_at = now()
  where id = p_receipt_id;
end;
$function$;
