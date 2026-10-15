-- Record store payments as income in the office ledger while retaining a separate store ledger.
create or replace function public.pay_offline_store_purchase(p_order_id uuid,p_amount numeric,p_payment_method text default 'cash')
returns void language plpgsql security definer set search_path to ''
as $function$
declare
 v_order public.offline_store_purchase_orders%rowtype;
 v_balance numeric(14,2);
 v_store_name text;
 v_finance_code text;
begin
 if auth.uid() is null then raise exception 'Silakan login terlebih dahulu'; end if;
 select * into v_order from public.offline_store_purchase_orders where id=p_order_id for update;
 if not found or v_order.status<>'received' then raise exception 'Pembayaran hanya dapat dicatat untuk pesanan yang sudah diterima'; end if;
 if not private.offline_store_member(v_order.store_id,array['manager']) and not private.is_admin_or_owner() then raise exception 'Hanya manager toko atau Owner/Admin yang dapat mencatat pembayaran'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Jumlah pembayaran harus lebih dari nol'; end if;
 v_balance:=v_order.subtotal-v_order.paid_amount;
 if p_amount>v_balance then raise exception 'Pembayaran melebihi sisa tagihan'; end if;
 if p_payment_method not in ('cash','bank_transfer','e_wallet','other') then raise exception 'Metode pembayaran tidak valid'; end if;
 select name into v_store_name from public.offline_stores where id=v_order.store_id;
 v_finance_code:='OFFICE-'||v_order.order_code||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 update public.offline_store_purchase_orders set paid_amount=paid_amount+p_amount,updated_at=now() where id=p_order_id;
 insert into public.offline_store_finance_entries(store_id,order_id,entry_type,amount,payment_method,description,reference_code,created_by)
 values(v_order.store_id,v_order.id,'purchase_payment',p_amount,p_payment_method,'Pembayaran pembelian ke kantor pusat',v_order.order_code,auth.uid());
 insert into public.financial_transactions(transaction_code,transaction_type,category_id,amount,transaction_at,payment_method,description,reference_code,status,created_by)
 values(v_finance_code,'income',null,p_amount,now(),p_payment_method,'Pembayaran pembelian internal dari toko '||coalesce(v_store_name,v_order.store_id::text),v_order.order_code,'posted',auth.uid());
 insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
 values(auth.uid(),'purchase_payment','offline_store_purchase_orders',p_order_id::text,jsonb_build_object('store_id',v_order.store_id,'amount',p_amount,'payment_method',p_payment_method,'office_finance_code',v_finance_code));
end;$function$;
