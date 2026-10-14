create or replace function public.record_stock_movement(p_product_id uuid,p_movement_type text,p_quantity numeric,p_unit_cost numeric default null,p_reference_code text default null,p_reason text default null,p_notes text default null) returns void language plpgsql security invoker set search_path=public,private as $$
declare v_stock numeric; declare v_delta numeric;
begin
if not private.is_admin_or_owner() then raise exception 'Hanya Admin/Owner yang dapat mengubah stok'; end if;
if p_quantity is null or p_quantity<=0 then raise exception 'Jumlah harus lebih dari nol'; end if;
if p_movement_type not in ('purchase_in','sale_out','internal_out','damaged_out','lost_out','customer_return_in','supplier_return_out','adjustment_in','adjustment_out') then raise exception 'Jenis pergerakan stok tidak valid'; end if;
select current_stock into v_stock from public.products where id=p_product_id for update;
if not found then raise exception 'Produk tidak ditemukan'; end if;
v_delta:=case when p_movement_type in ('purchase_in','customer_return_in','adjustment_in') then p_quantity else -p_quantity end;
if v_stock+v_delta<0 then raise exception 'Stok tidak mencukupi untuk pergerakan ini'; end if;
update public.products set current_stock=v_stock+v_delta,updated_at=now() where id=p_product_id;
insert into public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by) values(p_product_id,p_movement_type,p_quantity,p_unit_cost,p_reference_code,p_reason,p_notes,auth.uid());
end; $$;
create or replace function public.create_product_with_stock(p_sku text,p_barcode_value text,p_name text,p_category_id uuid,p_unit text,p_description text,p_sale_price numeric,p_initial_stock numeric,p_minimum_stock numeric,p_storage_location text) returns uuid language plpgsql security invoker set search_path=public,private as $$
declare v_product_id uuid;
begin
if not private.is_admin_or_owner() then raise exception 'Hanya Admin/Owner yang dapat menambah produk'; end if;
if coalesce(trim(p_sku),'')='' or coalesce(trim(p_barcode_value),'')='' or coalesce(trim(p_name),'')='' then raise exception 'SKU, barcode, dan nama produk wajib diisi'; end if;
if coalesce(p_sale_price,-1)<0 or coalesce(p_initial_stock,-1)<0 or coalesce(p_minimum_stock,-1)<0 then raise exception 'Harga dan stok tidak boleh negatif'; end if;
insert into public.products(sku,barcode_value,name,category_id,unit,description,sale_price,current_stock,minimum_stock,storage_location,is_active,created_by) values(trim(p_sku),trim(p_barcode_value),trim(p_name),p_category_id,coalesce(nullif(trim(p_unit),''),'pcs'),nullif(trim(p_description),''),p_sale_price,0,p_minimum_stock,nullif(trim(p_storage_location),''),true,auth.uid()) returning id into v_product_id;
if p_initial_stock>0 then perform public.record_stock_movement(v_product_id,'purchase_in',p_initial_stock,null,null,'Stok awal produk','Stok awal saat produk dibuat'); end if;
return v_product_id;
end; $$;
grant execute on function public.record_stock_movement(uuid,text,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.create_product_with_stock(text,text,text,uuid,text,text,numeric,numeric,numeric,text) to authenticated;
