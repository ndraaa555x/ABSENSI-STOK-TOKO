-- Add employee role and secure biometric enrollment metadata without removing existing business data.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role = any (array['owner','admin','employee']::text[]));

alter table public.employees
  add column if not exists profile_id uuid unique references public.profiles(id) on delete set null;

alter table public.attendance_records
  add column if not exists evidence_path text,
  add column if not exists evidence_expires_at timestamptz;

create table if not exists public.employee_face_templates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  embedding jsonb not null,
  consent_at timestamptz not null,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint face_embedding_array check (jsonb_typeof(embedding) = 'array')
);

alter table public.employee_face_templates enable row level security;

drop policy if exists face_templates_admin_all on public.employee_face_templates;
create policy face_templates_admin_all on public.employee_face_templates
  for all to authenticated
  using (private.is_admin_or_owner())
  with check (private.is_admin_or_owner());

drop policy if exists face_templates_employee_read_own on public.employee_face_templates;
create policy face_templates_employee_read_own on public.employee_face_templates
  for select to authenticated
  using (exists (
    select 1 from public.employees e
    where e.id = employee_face_templates.employee_id
      and e.profile_id = (select auth.uid())
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-evidence', 'attendance-evidence', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists attendance_evidence_admin_read on storage.objects;
create policy attendance_evidence_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'attendance-evidence' and private.is_admin_or_owner());

drop policy if exists attendance_evidence_employee_insert_own on storage.objects;
create policy attendance_evidence_employee_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attendance-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.employees e where e.profile_id = (select auth.uid()) and e.employment_status = 'active')
  );

drop policy if exists attendance_evidence_employee_read_own on storage.objects;
create policy attendance_evidence_employee_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attendance-evidence'
    and (
      private.is_admin_or_owner()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

drop policy if exists attendance_evidence_admin_delete on storage.objects;
create policy attendance_evidence_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'attendance-evidence' and private.is_admin_or_owner());

create index if not exists attendance_evidence_expiry_idx
  on public.attendance_records (evidence_expires_at)
  where evidence_path is not null;
