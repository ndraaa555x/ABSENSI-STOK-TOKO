-- Offline store purchasing from central office
create table if not exists public.offline_store_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  store_id uuid not null references public.offline_stores(id),
  status text not null default 'requested' check (status in ('requested','shipped','received','rejected','cancelled')),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  notes text,
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  shipped_by uuid references public.profiles(id),
  received_by uuid references public.profiles(id),
  requested_at timestamptz not null default now(),
  shipped_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.offline_store_purchase_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.offline_store_purchase_orders(id) on delete cascade,
  central_product_id uuid not null references public.products(id),
  store_product_id uuid references public.offline_store_products(id),
  quantity_requested numeric(14,3) not null check (quantity_requested > 0),
  quantity_shipped numeric(14,3) not null default 0 check (quantity_shipped >= 0),
  quantity_received numeric(14,3) not null default 0 check (quantity_received >= 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.offline_store_finance_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.offline_stores(id),
  order_id uuid references public.offline_store_purchase_orders(id),
  entry_type text not null check (entry_type in ('purchase_expense','purchase_payment')),
  amount numeric(14,2) not null check (amount > 0),
  payment_method text,
  description text not null,
  reference_code text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists offline_purchase_orders_store_idx on public.offline_store_purchase_orders(store_id, requested_at desc);
create index if not exists offline_purchase_items_order_idx on public.offline_store_purchase_items(order_id);
create index if not exists offline_store_finance_store_idx on public.offline_store_finance_entries(store_id, created_at desc);
alter table public.offline_store_purchase_orders enable row level security;
alter table public.offline_store_purchase_items enable row level security;
alter table public.offline_store_finance_entries enable row level security;
drop policy if exists offline_purchase_orders_read on public.offline_store_purchase_orders;
create policy offline_purchase_orders_read on public.offline_store_purchase_orders for select to authenticated using (private.is_admin_or_owner() or private.offline_store_member(store_id, array['manager','inventory','cashier']));
drop policy if exists offline_purchase_items_read on public.offline_store_purchase_items;
create policy offline_purchase_items_read on public.offline_store_purchase_items for select to authenticated using (exists (select 1 from public.offline_store_purchase_orders o where o.id=order_id and (private.is_admin_or_owner() or private.offline_store_member(o.store_id,array['manager','inventory','cashier']))));
drop policy if exists offline_store_finance_entries_read on public.offline_store_finance_entries;
create policy offline_store_finance_entries_read on public.offline_store_finance_entries for select to authenticated using (private.is_admin_or_owner() or private.offline_store_member(store_id,array['manager']));

create or replace function public.create_offline_store_purchase(p_store_id uuid, p_items jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_order_id uuid; v_code text; v_item jsonb; v_product public.products%rowtype; v_cost numeric(14,2); v_qty numeric(14,3); v_total numeric(14,2):=0;
begin
 if auth.uid() is null or not private.offline_store_member(p_store_id,array['manager','inventory']) then raise exception 'Hanya manager atau petugas stok toko yang dapat membuat permintaan pembelian'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Pilih minimal satu produk'; end if;
 v_code:='PO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.offline_store_purchase_orders(order_code,store_id,notes,requested_by) values(v_code,p_store_id,nullif(trim(p_notes),''),auth.uid()) returning id into v_order_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_product from public.products where id=(v_item->>'product_id')::uuid and is_active=true for share;
  if not found then raise exception 'Produk kantor tidak ditemukan atau tidak aktif'; end if;
  v_qty:=coalesce((v_item->>'quantity')::numeric,0); if v_qty<=0 then raise exception 'Jumlah setiap produk harus lebih dari nol'; end if;
  select coalesce(pc.cost_price,0) into v_cost from public.products p left join public.product_costs pc on pc.product_id=p.id where p.id=v_product.id;
  v_total:=v_total+(v_qty*v_cost);
  insert into public.offline_store_purchase_items(order_id,central_product_id,quantity_requested,unit_cost,line_total) values(v_order_id,v_product.id,v_qty,v_cost,v_qty*v_cost);
 end loop;
 update public.offline_store_purchase_orders set subtotal=v_total where id=v_order_id;
 insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),'purchase_requested','offline_store_purchase_orders',v_order_id::text,jsonb_build_object('store_id',p_store_id,'order_code',v_code,'subtotal',v_total));
 return v_order_id;
end;$function$;

create or replace function public.ship_offline_store_purchase(p_order_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_order public.offline_store_purchase_orders%rowtype; v_item record;
begin
 if auth.uid() is null or not private.is_admin_or_owner() then raise exception 'Hanya Owner/Admin yang dapat memproses pengiriman pembelian toko'; end if;
 select * into v_order from public.offline_store_purchase_orders where id=p_order_id for update;
 if not found or v_order.status<>'requested' then raise exception 'Pesanan tidak ditemukan atau sudah diproses'; end if;
 for v_item in select i.*,p.name,p.sku,p.current_stock from public.offline_store_purchase_items i join public.products p on p.id=i.central_product_id where i.order_id=p_order_id order by i.central_product_id for update of p loop
  if v_item.current_stock<v_item.quantity_requested then raise exception 'Stok kantor tidak cukup untuk produk % (tersedia %, diminta %)',v_item.name,v_item.current_stock,v_item.quantity_requested; end if;
  update public.products set current_stock=current_stock-v_item.quantity_requested,updated_at=now() where id=v_item.central_product_id;
  insert into public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by) values(v_item.central_product_id,'internal_out',v_item.quantity_requested,v_item.unit_cost,v_order.order_code,'Pengiriman ke toko offline',v_item.name||' ('||v_item.sku||')',auth.uid());
  update public.offline_store_purchase_items set quantity_shipped=quantity_requested where id=v_item.id;
 end loop;
 update public.offline_store_purchase_orders set status='shipped',reviewed_by=auth.uid(),shipped_by=auth.uid(),shipped_at=now(),updated_at=now() where id=p_order_id;
 insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),'purchase_shipped','offline_store_purchase_orders',p_order_id::text,jsonb_build_object('store_id',v_order.store_id,'order_code',v_order.order_code,'subtotal',v_order.subtotal));
end;$function$;

create or replace function public.reject_offline_store_purchase(p_order_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_order public.offline_store_purchase_orders%rowtype;
begin
 if auth.uid() is null or not private.is_admin_or_owner() then raise exception 'Hanya Owner/Admin yang dapat menolak pesanan'; end if;
 select * into v_order from public.offline_store_purchase_orders where id=p_order_id for update;
 if not found or v_order.status<>'requested' then raise exception 'Pesanan tidak ditemukan atau sudah diproses'; end if;
 update public.offline_store_purchase_orders set status='rejected',reviewed_by=auth.uid(),notes=concat_ws(E'\n',notes,nullif(trim(p_reason),'')),updated_at=now() where id=p_order_id;
 insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),'purchase_rejected','offline_store_purchase_orders',p_order_id::text,jsonb_build_object('store_id',v_order.store_id,'reason',p_reason));
end;$function$;

create or replace function public.receive_offline_store_purchase(p_order_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_order public.offline_store_purchase_orders%rowtype; v_item record; v_store_product_id uuid; v_receipt_id uuid; v_receipt_item_id uuid;
begin
 if auth.uid() is null then raise exception 'Silakan login terlebih dahulu'; end if;
 select * into v_order from public.offline_store_purchase_orders where id=p_order_id for update;
 if not found or v_order.status<>'shipped' then raise exception 'Pesanan tidak ditemukan atau belum dikirim'; end if;
 if not private.offline_store_member(v_order.store_id,array['manager','inventory']) then raise exception 'Hanya manager atau petugas stok toko yang dapat menerima barang'; end if;
 insert into public.offline_stock_receipts(store_id,receipt_code,status,supplier_name,notes,created_by,received_by,received_at) values(v_order.store_id,'PO-RCV-'||v_order.order_code,'received','Kantor Pusat','Penerimaan dari kantor: '||v_order.order_code,auth.uid(),auth.uid(),now()) returning id into v_receipt_id;
 for v_item in select i.*,p.name,p.sku,p.barcode_value,p.category_id,p.unit,p.description,p.sale_price from public.offline_store_purchase_items i join public.products p on p.id=i.central_product_id where i.order_id=p_order_id order by i.central_product_id loop
  select id into v_store_product_id from public.offline_store_products where store_id=v_order.store_id and central_product_id=v_item.central_product_id limit 1 for update;
  if v_store_product_id is null then
   insert into public.offline_store_products(store_id,central_product_id,source_type,name,sku,barcode_value,category_id,unit,description,sale_price,current_stock,minimum_stock,is_active,created_by) values(v_order.store_id,v_item.central_product_id,'central',v_item.name,v_item.sku,v_item.barcode_value,v_item.category_id,v_item.unit,v_item.description,v_item.sale_price,0,0,true,auth.uid()) returning id into v_store_product_id;
  end if;
  update public.offline_store_products set current_stock=current_stock+v_item.quantity_shipped,updated_at=now() where id=v_store_product_id;
  insert into public.offline_stock_receipt_items(receipt_id,store_product_id,quantity,unit_cost) values(v_receipt_id,v_store_product_id,v_item.quantity_shipped,v_item.unit_cost) returning id into v_receipt_item_id;
  insert into public.offline_product_cost_batches(store_id,store_product_id,receipt_item_id,quantity_received,quantity_remaining,unit_cost,created_by) values(v_order.store_id,v_store_product_id,v_receipt_item_id,v_item.quantity_shipped,v_item.quantity_shipped,v_item.unit_cost,auth.uid());
  update public.offline_store_purchase_items set store_product_id=v_store_product_id,quantity_received=quantity_shipped where id=v_item.id;
 end loop;
 insert into public.offline_store_finance_entries(store_id,order_id,entry_type,amount,description,reference_code,created_by) values(v_order.store_id,v_order.id,'purchase_expense',v_order.subtotal,'Pembelian stok dari kantor pusat',v_order.order_code,auth.uid());
 update public.offline_store_purchase_orders set status='received',received_by=auth.uid(),received_at=now(),updated_at=now() where id=p_order_id;
 insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),'purchase_received','offline_store_purchase_orders',p_order_id::text,jsonb_build_object('store_id',v_order.store_id,'order_code',v_order.order_code,'subtotal',v_order.subtotal));
end;$function$;

create or replace function public.pay_offline_store_purchase(p_order_id uuid,p_amount numeric,p_payment_method text default 'cash')
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_order public.offline_store_purchase_orders%rowtype; v_balance numeric(14,2);
begin
 if auth.uid() is null then raise exception 'Silakan login terlebih dahulu'; end if;
 select * into v_order from public.offline_store_purchase_orders where id=p_order_id for update;
 if not found or v_order.status<>'received' then raise exception 'Pembayaran hanya dapat dicatat untuk pesanan yang sudah diterima'; end if;
 if not private.offline_store_member(v_order.store_id,array['manager']) and not private.is_admin_or_owner() then raise exception 'Hanya manager toko atau Owner/Admin yang dapat mencatat pembayaran'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Jumlah pembayaran harus lebih dari nol'; end if;
 v_balance:=v_order.subtotal-v_order.paid_amount;
 if p_amount>v_balance then raise exception 'Pembayaran melebihi sisa tagihan'; end if;
 if p_payment_method not in ('cash','bank_transfer','e_wallet','other') then raise exception 'Metode pembayaran tidak valid'; end if;
 update public.offline_store_purchase_orders set paid_amount=paid_amount+p_amount,updated_at=now() where id=p_order_id;
 insert into public.offline_store_finance_entries(store_id,order_id,entry_type,amount,payment_method,description,reference_code,created_by) values(v_order.store_id,v_order.id,'purchase_payment',p_amount,p_payment_method,'Pembayaran pembelian ke kantor pusat',v_order.order_code,auth.uid());
 insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),'purchase_payment','offline_store_purchase_orders',p_order_id::text,jsonb_build_object('store_id',v_order.store_id,'amount',p_amount,'payment_method',p_payment_method));
end;$function$;
revoke all on function public.create_offline_store_purchase(uuid,jsonb,text) from public,anon;
revoke all on function public.ship_offline_store_purchase(uuid) from public,anon;
revoke all on function public.reject_offline_store_purchase(uuid,text) from public,anon;
revoke all on function public.receive_offline_store_purchase(uuid) from public,anon;
revoke all on function public.pay_offline_store_purchase(uuid,numeric,text) from public,anon;
grant execute on function public.create_offline_store_purchase(uuid,jsonb,text) to authenticated;
grant execute on function public.ship_offline_store_purchase(uuid) to authenticated;
grant execute on function public.reject_offline_store_purchase(uuid,text) to authenticated;
grant execute on function public.receive_offline_store_purchase(uuid) to authenticated;
grant execute on function public.pay_offline_store_purchase(uuid,numeric,text) to authenticated;
