create or replace function private.write_business_audit() returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_row jsonb; declare v_id text; declare v_code text; declare v_status text;
begin
if auth.uid() is null then if TG_OP='DELETE' then return OLD; else return NEW; end if; end if;
if TG_OP='DELETE' then v_row:=to_jsonb(OLD); else v_row:=to_jsonb(NEW); end if;
v_id:=coalesce(v_row->>'id',v_row->>'order_id',v_row->>'product_id');
v_code:=coalesce(v_row->>'order_code',v_row->>'refund_code',v_row->>'report_code',v_row->>'transaction_code',v_row->>'sku',v_row->>'employee_code');
v_status:=v_row->>'status';
insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),lower(TG_OP),TG_TABLE_NAME,v_id,jsonb_strip_nulls(jsonb_build_object('code',v_code,'status',v_status,'recorded_at',now())));
if TG_OP='DELETE' then return OLD; else return NEW; end if;
end; $$;
revoke all on function private.write_business_audit() from public,anon,authenticated;
drop trigger if exists audit_product_orders on public.product_orders;
create trigger audit_product_orders after insert or update or delete on public.product_orders for each row execute function private.write_business_audit();
drop trigger if exists audit_product_refunds on public.product_refunds;
create trigger audit_product_refunds after insert or update or delete on public.product_refunds for each row execute function private.write_business_audit();
drop trigger if exists audit_financial_reports on public.financial_reports;
create trigger audit_financial_reports after insert or update or delete on public.financial_reports for each row execute function private.write_business_audit();
drop trigger if exists audit_financial_transactions on public.financial_transactions;
create trigger audit_financial_transactions after insert or update or delete on public.financial_transactions for each row execute function private.write_business_audit();
drop trigger if exists audit_products on public.products;
create trigger audit_products after insert or update or delete on public.products for each row execute function private.write_business_audit();
drop trigger if exists audit_stock_movements on public.stock_movements;
create trigger audit_stock_movements after insert or update or delete on public.stock_movements for each row execute function private.write_business_audit();
drop trigger if exists audit_leave_requests on public.leave_requests;
create trigger audit_leave_requests after insert or update or delete on public.leave_requests for each row execute function private.write_business_audit();
drop trigger if exists audit_employees on public.employees;
create trigger audit_employees after insert or update or delete on public.employees for each row execute function private.write_business_audit();
