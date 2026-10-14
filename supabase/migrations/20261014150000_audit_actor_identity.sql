-- Record the acting account's readable identity in business audit events.
-- Existing audit history is preserved; this migration does not reset operational data.

create or replace function private.write_business_audit()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_row jsonb;
  v_id text;
  v_code text;
  v_status text;
  v_actor_name text;
  v_actor_email text;
begin
  if auth.uid() is null then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;
  if TG_OP = 'DELETE' then v_row := to_jsonb(OLD); else v_row := to_jsonb(NEW); end if;
  v_id := coalesce(v_row->>'id', v_row->>'order_id', v_row->>'product_id');
  v_code := coalesce(v_row->>'order_code', v_row->>'refund_code', v_row->>'report_code', v_row->>'transaction_code', v_row->>'sku', v_row->>'employee_code', v_row->>'customer_code', v_row->>'reference_code');
  v_status := v_row->>'status';
  select coalesce(nullif(trim(full_name), ''), email), email
    into v_actor_name, v_actor_email
    from public.profiles where id = auth.uid();
  insert into public.audit_logs(actor_id, action, entity_table, entity_id, details)
  values (
    auth.uid(), lower(TG_OP), TG_TABLE_NAME, v_id,
    jsonb_strip_nulls(jsonb_build_object(
      'code', v_code,
      'status', v_status,
      'actor_name', coalesce(v_actor_name, v_actor_email, 'Akun tidak dikenal'),
      'actor_email', v_actor_email,
      'record_name', coalesce(v_row->>'name', v_row->>'full_name', v_row->>'description', v_row->>'title'),
      'sku', v_row->>'sku',
      'amount', v_row->>'amount',
      'quantity', v_row->>'quantity',
      'reason', v_row->>'reason',
      'recorded_at', now()
    ))
  );
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$function$;

-- Add audit coverage for operational tables that previously lacked triggers.
do $block$
declare t text;
begin
  foreach t in array array['app_settings','attendance_records','business_customers','employee_face_templates','financial_categories','product_categories','product_costs','product_order_items','notifications'] loop
    if not exists (
      select 1 from pg_trigger g
      join pg_class c on c.oid = g.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and g.tgname = 'audit_' || t and not g.tgisinternal
    ) then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.write_business_audit()', 'audit_' || t, t);
    end if;
  end loop;
end;
$block$;

-- Add actor identity to existing audit entries when the account still exists.
update public.audit_logs a
set details = a.details || jsonb_strip_nulls(jsonb_build_object(
  'actor_name', coalesce(nullif(trim(p.full_name), ''), p.email),
  'actor_email', p.email
))
from public.profiles p
where a.actor_id = p.id
  and (not (a.details ? 'actor_name') or not (a.details ? 'actor_email'));
