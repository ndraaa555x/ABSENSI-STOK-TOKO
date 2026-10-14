-- Ensure evidence retention is calculated by the database and attendance history is private.
create or replace function public.set_attendance_evidence_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.evidence_path is null then
    new.evidence_expires_at := null;
  elsif tg_op = 'INSERT' then
    new.evidence_expires_at := now() + interval '7 days';
  elsif new.evidence_path is distinct from old.evidence_path or new.evidence_expires_at is null then
    new.evidence_expires_at := now() + interval '7 days';
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_evidence_expiry_trigger on public.attendance_records;
create trigger attendance_evidence_expiry_trigger
before insert or update of evidence_path, evidence_expires_at
on public.attendance_records
for each row execute function public.set_attendance_evidence_expiry();

drop policy if exists attendance_active_select on public.attendance_records;
drop policy if exists attendance_owner_admin_or_self_select on public.attendance_records;
create policy attendance_owner_admin_or_self_select on public.attendance_records
for select to authenticated
using (
  private.is_admin_or_owner()
  or exists (
    select 1 from public.employees e
    where e.id = attendance_records.employee_id
      and e.profile_id = (select auth.uid())
      and e.employment_status = 'active'
  )
);
