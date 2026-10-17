-- Restore scheduled store promotions in the hardened private checkout RPC.
-- Promotions are applied automatically when active and in their time window.
-- Manual discount and promotional discount do not stack: the greater valid discount wins.
-- Keep central inventory movement at the internal shipment stage only.
create or replace function private.complete_offline_store_sale(
  p_store_id uuid,
  p_sale_code text,
  p_items jsonb,
  p_payment_method text default 'cash',
  p_discount_percent numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sale_id uuid;
  v_item jsonb;
  v_product public.offline_store_products%rowtype;
  v_batch record;
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_line_discount numeric(14,2);
  v_qty numeric(14,3);
  v_need numeric(14,3);
  v_take numeric(14,3);
  v_price numeric(14,2);
  v_cost_total numeric(14,2);
  v_unit_cost numeric(14,2);
  v_cogs_total numeric(14,2) := 0;
  v_allowed numeric(5,2);
  v_role text;
  v_line_total numeric(14,2);
  v_promo_discount numeric(14,2);
  v_manual_discount numeric(14,2);
begin
  if auth.uid() is null
     or not private.offline_store_member(p_store_id, array['manager','store_admin','cashier']) then
    raise exception 'Akses kasir tidak diizinkan';
  end if;

  if coalesce(trim(p_sale_code), '') = ''
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Transaksi harus memiliki kode dan item';
  end if;

  if (select count(*) from jsonb_array_elements(p_items))
     <> (select count(distinct value->>'store_product_id') from jsonb_array_elements(p_items)) then
    raise exception 'Produk yang sama tidak boleh dimasukkan dua kali dalam satu transaksi';
  end if;

  if p_payment_method not in ('cash','bank_transfer','e_wallet','card','other') then
    raise exception 'Metode pembayaran tidak valid';
  end if;

  select m.store_role into v_role
  from public.offline_store_memberships m
  where m.store_id = p_store_id
    and m.user_id = auth.uid()
    and m.is_active;

  if private.is_admin_or_owner() then
    v_role := 'manager';
  end if;

  select case when v_role in ('manager','store_admin') then manager_max_percent else cashier_max_percent end
    into v_allowed
  from public.offline_store_discount_policies
  where store_id = p_store_id;

  v_allowed := coalesce(v_allowed, case when v_role in ('manager','store_admin') then 15 else 5 end);

  if coalesce(p_discount_percent,0) < 0 or p_discount_percent > v_allowed then
    raise exception 'Diskon melebihi batas peran Anda (maksimal %)', v_allowed;
  end if;

  -- Validate stock and calculate the exact best discount for each line.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);

    select * into v_product
    from public.offline_store_products
    where id = (v_item->>'store_product_id')::uuid
      and store_id = p_store_id
      and is_active
    for update;

    if not found then
      raise exception 'Produk tidak ditemukan atau tidak aktif';
    end if;
    if v_qty <= 0 or v_product.current_stock < v_qty then
      raise exception 'Stok tidak cukup untuk produk %', v_product.name;
    end if;

    v_subtotal := v_subtotal + round(v_qty * v_product.sale_price, 2);

    select coalesce(max(
      case
        when d.discount_type = 'percent' then least(v_product.sale_price, v_product.sale_price * d.discount_value / 100)
        else least(v_product.sale_price, d.discount_value)
      end
    ), 0)
    into v_promo_discount
    from public.offline_store_discounts d
    where d.store_id = p_store_id
      and d.is_active
      and d.starts_at <= now()
      and (d.ends_at is null or d.ends_at > now())
      and (d.store_product_id is null or d.store_product_id = v_product.id);

    v_manual_discount := round(v_qty * v_product.sale_price * coalesce(p_discount_percent,0) / 100, 2);
    v_discount := v_discount + greatest(v_manual_discount, round(v_qty * v_promo_discount, 2));
  end loop;

  insert into public.offline_store_sales(store_id,sale_code,subtotal,discount_total,total,payment_method,cashier_id)
  values(p_store_id,trim(p_sale_code),v_subtotal,v_discount,v_subtotal-v_discount,p_payment_method,auth.uid())
  returning id into v_sale_id;

  -- Consume FIFO cost batches and persist the promotional/manual discount per item.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric;

    select * into v_product
    from public.offline_store_products
    where id = (v_item->>'store_product_id')::uuid
      and store_id = p_store_id
    for update;

    v_price := v_product.sale_price;

    select coalesce(max(
      case
        when d.discount_type = 'percent' then least(v_price, v_price * d.discount_value / 100)
        else least(v_price, d.discount_value)
      end
    ), 0)
    into v_promo_discount
    from public.offline_store_discounts d
    where d.store_id = p_store_id
      and d.is_active
      and d.starts_at <= now()
      and (d.ends_at is null or d.ends_at > now())
      and (d.store_product_id is null or d.store_product_id = v_product.id);

    v_manual_discount := round(v_qty * v_price * coalesce(p_discount_percent,0) / 100, 2);
    v_line_discount := greatest(v_manual_discount, round(v_qty * v_promo_discount, 2));

    v_need := v_qty;
    v_cost_total := 0;

    for v_batch in
      select b.id,b.quantity_remaining,b.unit_cost
      from public.offline_product_cost_batches b
      where b.store_product_id = v_product.id
        and b.quantity_remaining > 0
      order by b.received_at,b.id
      for update
    loop
      exit when v_need <= 0;
      v_take := least(v_need,v_batch.quantity_remaining);
      v_cost_total := v_cost_total + (v_take * v_batch.unit_cost);
      v_need := v_need - v_take;
      update public.offline_product_cost_batches
      set quantity_remaining = quantity_remaining - v_take
      where id = v_batch.id;
    end loop;

    if v_need > 0 then
      raise exception 'Riwayat harga modal tidak mencukupi untuk produk %. Catat penerimaan stok beserta harga modal terlebih dahulu.', v_product.name;
    end if;

    v_unit_cost := case when v_qty > 0 then round(v_cost_total / v_qty, 2) else 0 end;
    v_line_total := round(v_qty * v_price, 2) - v_line_discount;

    insert into public.offline_store_sale_items(
      sale_id,store_product_id,product_name,quantity,unit_price,discount_amount,unit_cost_snapshot,line_total
    ) values (
      v_sale_id,v_product.id,v_product.name,v_qty,v_price,v_line_discount,v_unit_cost,v_line_total
    );

    update public.offline_store_products
    set current_stock = current_stock - v_qty, updated_at = now()
    where id = v_product.id;

    v_cogs_total := v_cogs_total + v_cost_total;
  end loop;

  if (v_subtotal-v_discount) > 0 then
    insert into public.offline_store_finance_entries(store_id,entry_type,amount,payment_method,description,reference_code,created_by)
    values(p_store_id,'sale_income',v_subtotal-v_discount,p_payment_method,'Pendapatan penjualan toko offline',trim(p_sale_code),auth.uid());
  end if;

  if v_cogs_total > 0 then
    insert into public.offline_store_finance_entries(store_id,entry_type,amount,description,reference_code,created_by)
    values(p_store_id,'cogs_expense',v_cogs_total,'Harga pokok barang terjual (FIFO)',trim(p_sale_code),auth.uid());
  end if;

  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
  values(auth.uid(),'sale','offline_store_sales',v_sale_id::text,jsonb_build_object(
    'store_id',p_store_id,
    'sale_code',trim(p_sale_code),
    'subtotal',v_subtotal,
    'discount',v_discount,
    'total',v_subtotal-v_discount,
    'cogs',v_cogs_total
  ));

  return v_sale_id;
end
$function$;

create or replace function public.complete_offline_store_sale(
  p_store_id uuid,
  p_sale_code text,
  p_items jsonb,
  p_payment_method text default 'cash',
  p_discount_percent numeric default 0
)
returns uuid
language sql
set search_path to ''
as $function$
  select private.complete_offline_store_sale($1, $2, $3, $4, $5);
$function$;

revoke execute on function public.complete_offline_store_sale(uuid,text,jsonb,text,numeric) from anon, public;
grant execute on function public.complete_offline_store_sale(uuid,text,jsonb,text,numeric) to authenticated;
revoke execute on function private.complete_offline_store_sale(uuid,text,jsonb,text,numeric) from anon, public;
grant execute on function private.complete_offline_store_sale(uuid,text,jsonb,text,numeric) to authenticated;
