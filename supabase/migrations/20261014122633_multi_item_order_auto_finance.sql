-- One order may contain multiple product lines, with stock reserved atomically.
create or replace function public.submit_product_order_multi(
  p_items jsonb,
  p_notes text default null,
  p_customer_id uuid default null,
  p_payment_method text default 'other',
  p_payment_evidence_path text default null
) returns table(order_id uuid, order_code text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_order_id uuid;
  v_code text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity numeric;
  v_count integer := 0;
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Akun tidak aktif atau belum memiliki akses';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Tambahkan minimal satu produk ke order';
  end if;
  if coalesce(p_payment_method,'') not in ('cash','bank_transfer','e_wallet','card','other') then
    raise exception 'Metode pembayaran tidak valid';
  end if;
  if p_payment_evidence_path is not null and split_part(p_payment_evidence_path,'/',1) <> auth.uid()::text then
    raise exception 'Lokasi bukti pembayaran tidak valid';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.business_customers c where c.id=p_customer_id and c.is_active=true
  ) then raise exception 'Data toko/pembeli tidak ditemukan atau tidak aktif'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 then raise exception 'Jumlah setiap produk harus lebih dari nol'; end if;
    select * into v_product from public.products where id=v_product_id and is_active=true for update;
    if not found then raise exception 'Produk tidak ditemukan atau sudah dinonaktifkan'; end if;
    if v_quantity > v_product.current_stock then
      raise exception 'Stok % tersedia hanya % %', v_product.name, v_product.current_stock, v_product.unit;
    end if;
    v_count := v_count + 1;
  end loop;
  if v_count > 50 then raise exception 'Satu order maksimal 50 baris produk'; end if;

  v_code := 'ORD-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.product_orders(order_code,ordered_by,notes,customer_id,payment_method,payment_evidence_path,stock_reserved)
  values(v_code,auth.uid(),nullif(trim(p_notes),''),p_customer_id,p_payment_method,p_payment_evidence_path,true)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    select * into v_product from public.products where id=v_product_id and is_active=true for update;
    insert into public.product_order_items(order_id,product_id,quantity,unit_price,line_total)
    values(v_order_id,v_product.id,v_quantity,v_product.sale_price,v_quantity*v_product.sale_price);
    update public.products set current_stock=current_stock-v_quantity,updated_at=now() where id=v_product.id;
    insert into public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by)
    values(v_product.id,'internal_out',v_quantity,null,v_code,'Stok dicadangkan saat order karyawan masuk',
      'Reservasi otomatis; jika order ditolak, stok dikembalikan otomatis',auth.uid());
  end loop;
  return query select v_order_id,v_code;
end;
$$;
revoke all on function public.submit_product_order_multi(jsonb,text,uuid,text,text) from public, anon;
grant execute on function public.submit_product_order_multi(jsonb,text,uuid,text,text) to authenticated;

-- Post one income transaction when an order is approved, and never duplicate it.
create or replace function public.post_order_finance_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_total numeric;
declare v_category_id uuid;
begin
  if new.status='approved' and old.status is distinct from new.status then
    select coalesce(sum(line_total),0) into v_total from public.product_order_items where order_id=new.id;
    select id into v_category_id from public.financial_categories
      where transaction_type='income' and lower(name) in ('penjualan order','penjualan') and is_active=true
      order by case when lower(name)='penjualan order' then 0 else 1 end limit 1;
    if v_category_id is null then
      insert into public.financial_categories(name,transaction_type,description)
      values('Penjualan Order','income','Otomatis dari order yang disetujui Admin/Owner')
      on conflict (name,transaction_type) do nothing;
      select id into v_category_id from public.financial_categories where lower(name)='penjualan order' and transaction_type='income' limit 1;
    end if;
    if v_total > 0 and not exists(select 1 from public.financial_transactions where reference_code=new.order_code and status='posted') then
      insert into public.financial_transactions(transaction_code,transaction_type,category_id,amount,transaction_at,payment_method,description,reference_code,status,created_by)
      values('FIN-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
        'income',v_category_id,v_total,coalesce(new.reviewed_at,now()),new.payment_method,
        'Penjualan dari order '||new.order_code,new.order_code,'posted',new.reviewed_by);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_post_order_finance_on_approval on public.product_orders;
create trigger trg_post_order_finance_on_approval after update of status on public.product_orders
for each row execute function public.post_order_finance_on_approval();

-- Backfill previously approved/fulfilled orders without a posted income row.
insert into public.financial_categories(name,transaction_type,description)
values('Penjualan Order','income','Otomatis dari order yang disetujui Admin/Owner')
on conflict (name,transaction_type) do nothing;
insert into public.financial_transactions(transaction_code,transaction_type,category_id,amount,transaction_at,payment_method,description,reference_code,status,created_by)
select 'FIN-'||to_char(coalesce(o.reviewed_at,o.created_at),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  'income',c.id,sum(i.line_total),coalesce(o.reviewed_at,o.created_at),o.payment_method,
  'Penjualan dari order '||o.order_code,o.order_code,'posted',coalesce(o.reviewed_by,o.ordered_by)
from public.product_orders o
join public.product_order_items i on i.order_id=o.id
join public.financial_categories c on c.name='Penjualan Order' and c.transaction_type='income'
where o.status in ('approved','fulfilled')
  and not exists(select 1 from public.financial_transactions f where f.reference_code=o.order_code and f.status='posted')
group by o.id,c.id;
