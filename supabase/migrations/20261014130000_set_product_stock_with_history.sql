-- Allow Admin/Owner to set an exact stock count while recording the difference in stock movements.
create or replace function public.set_product_stock(
  p_product_id uuid,
  p_target_stock numeric,
  p_reason text default 'Penyesuaian stok melalui edit produk'
) returns numeric
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_current numeric;
  v_delta numeric;
  v_movement_type text;
begin
  if not private.is_admin_or_owner() then
    raise exception 'Hanya Admin/Owner yang dapat mengubah stok';
  end if;
  if p_target_stock is null or p_target_stock < 0 then
    raise exception 'Stok tidak boleh kosong atau negatif';
  end if;
  select current_stock into v_current
  from public.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'Produk tidak ditemukan';
  end if;
  v_delta := p_target_stock - v_current;
  if v_delta = 0 then
    return v_current;
  end if;
  v_movement_type := case when v_delta > 0 then 'adjustment_in' else 'adjustment_out' end;
  update public.products
  set current_stock = p_target_stock, updated_at = now()
  where id = p_product_id;
  insert into public.stock_movements(
    product_id, movement_type, quantity, unit_cost, reference_code, reason, notes, created_by
  ) values (
    p_product_id,
    v_movement_type,
    abs(v_delta),
    null,
    'ADJ-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
    coalesce(nullif(trim(p_reason),''),'Penyesuaian stok melalui edit produk'),
    'Stok sebelumnya: ' || v_current || '; stok baru: ' || p_target_stock || '; selisih: ' || v_delta,
    auth.uid()
  );
  return p_target_stock;
end;
$$;
revoke all on function public.set_product_stock(uuid,numeric,text) from public, anon;
grant execute on function public.set_product_stock(uuid,numeric,text) to authenticated;
