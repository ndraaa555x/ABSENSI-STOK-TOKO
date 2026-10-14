create or replace function public.approve_product_refund(p_refund_id uuid) returns void language plpgsql security invoker set search_path=public,private as $$
declare v_refund public.product_refunds%rowtype; declare v_item public.product_order_items%rowtype; declare v_order public.product_orders%rowtype; declare v_code text; declare v_transaction_id uuid; declare v_prior_refund numeric;
begin
if not private.is_admin_or_owner() then raise exception 'Hanya Admin/Owner yang dapat memeriksa refund'; end if;
select * into v_refund from public.product_refunds where id=p_refund_id for update;
if not found then raise exception 'Refund tidak ditemukan'; end if;
if v_refund.status<>'pending' or v_refund.posted_transaction_id is not null then raise exception 'Refund ini sudah pernah diproses'; end if;
select * into v_item from public.product_order_items where id=v_refund.order_item_id for update;
if not found then raise exception 'Detail order tidak ditemukan'; end if;
select * into v_order from public.product_orders where id=v_refund.order_id for update;
if not found or v_order.status not in ('approved','fulfilled') then raise exception 'Order asal tidak valid untuk refund'; end if;
if v_item.order_id<>v_refund.order_id or v_refund.quantity>v_item.quantity then raise exception 'Jumlah refund melebihi detail order'; end if;
select coalesce(sum(quantity),0) into v_prior_refund from public.product_refunds where order_item_id=v_item.id and status='approved' and id<>v_refund.id;
if v_prior_refund+v_refund.quantity>v_item.quantity then raise exception 'Total refund melebihi jumlah yang dipesan'; end if;
v_code:='REF-'||replace(v_refund.refund_code,'REF-','');
insert into public.financial_transactions(transaction_code,transaction_type,amount,transaction_at,payment_method,description,reference_code,status,created_by) values(v_code,'expense',v_refund.amount,now(),'other','Refund produk untuk order '||v_order.order_code,v_refund.refund_code,'posted',auth.uid()) returning id into v_transaction_id;
update public.products set current_stock=current_stock+v_refund.quantity,updated_at=now() where id=v_item.product_id;
insert into public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by) values(v_item.product_id,'customer_return_in',v_refund.quantity,v_item.unit_price,v_refund.refund_code,'Refund produk disetujui','Stok dan buku keuangan diperbarui atomik',auth.uid());
update public.product_refunds set status='approved',posted_transaction_id=v_transaction_id,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_refund_id;
end; $$;

create or replace function private.notify_business_workflow() returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_recipient uuid; declare v_title text; declare v_message text; declare v_type text;
begin
if auth.uid() is null then if TG_OP='DELETE' then return OLD; else return NEW; end if; end if;
if TG_TABLE_NAME='product_orders' then
 if TG_OP='INSERT' then v_title:='Order produk baru';v_message:='Order '||NEW.order_code||' menunggu pemeriksaan.';v_type:='order';insert into public.notifications(user_id,title,message,notification_type) select id,v_title,v_message,v_type from public.profiles where role in ('owner','admin') and is_active=true;
 elsif OLD.status is distinct from NEW.status then v_title:='Status order diperbarui';v_message:='Order '||NEW.order_code||' sekarang berstatus '||NEW.status||'.';v_type:='order';insert into public.notifications(user_id,title,message,notification_type) values(NEW.ordered_by,v_title,v_message,v_type); end if;
elsif TG_TABLE_NAME='product_refunds' then
 if TG_OP='INSERT' then v_title:='Permintaan refund baru';v_message:='Refund '||NEW.refund_code||' menunggu pemeriksaan.';v_type:='refund';insert into public.notifications(user_id,title,message,notification_type) select id,v_title,v_message,v_type from public.profiles where role in ('owner','admin') and is_active=true;
 elsif OLD.status is distinct from NEW.status then v_title:='Status refund diperbarui';v_message:='Refund '||NEW.refund_code||' sekarang berstatus '||NEW.status||'.';v_type:='refund';insert into public.notifications(user_id,title,message,notification_type) values(NEW.requested_by,v_title,v_message,v_type); end if;
elsif TG_TABLE_NAME='financial_reports' then
 if TG_OP='INSERT' then v_title:='Laporan uang baru';v_message:='Laporan '||NEW.report_code||' menunggu verifikasi.';v_type:='finance';insert into public.notifications(user_id,title,message,notification_type) select id,v_title,v_message,v_type from public.profiles where role in ('owner','admin') and is_active=true;
 elsif OLD.status is distinct from NEW.status then v_title:='Status laporan uang';v_message:='Laporan '||NEW.report_code||' sekarang berstatus '||NEW.status||'.';v_type:='finance';insert into public.notifications(user_id,title,message,notification_type) values(NEW.submitted_by,v_title,v_message,v_type); end if;
elsif TG_TABLE_NAME='leave_requests' then
 if TG_OP='INSERT' then v_title:='Permohonan izin baru';v_message:='Permohonan izin/cuti menunggu pemeriksaan.';v_type:='leave';insert into public.notifications(user_id,title,message,notification_type) select id,v_title,v_message,v_type from public.profiles where role in ('owner','admin') and is_active=true;
 elsif OLD.status is distinct from NEW.status then v_title:='Status izin/cuti diperbarui';v_message:='Permohonan izin/cuti sekarang berstatus '||NEW.status||'.';v_type:='leave';select profile_id into v_recipient from public.employees where id=NEW.employee_id;if v_recipient is not null then insert into public.notifications(user_id,title,message,notification_type) values(v_recipient,v_title,v_message,v_type);end if; end if;
end if;
if TG_OP='DELETE' then return OLD; else return NEW; end if;
end; $$;
revoke all on function private.notify_business_workflow() from public,anon,authenticated;
drop trigger if exists notify_product_orders on public.product_orders;
create trigger notify_product_orders after insert or update of status on public.product_orders for each row execute function private.notify_business_workflow();
drop trigger if exists notify_product_refunds on public.product_refunds;
create trigger notify_product_refunds after insert or update of status on public.product_refunds for each row execute function private.notify_business_workflow();
drop trigger if exists notify_financial_reports on public.financial_reports;
create trigger notify_financial_reports after insert or update of status on public.financial_reports for each row execute function private.notify_business_workflow();
drop trigger if exists notify_leave_requests on public.leave_requests;
create trigger notify_leave_requests after insert or update of status on public.leave_requests for each row execute function private.notify_business_workflow();
