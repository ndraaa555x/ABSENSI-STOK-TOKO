-- Rencana B+: store job titles, one active store placement, and delegated team management.
alter table public.offline_store_memberships
  add column if not exists job_title_id uuid,
  add column if not exists job_title text;

alter table public.offline_store_memberships
  drop constraint if exists offline_store_memberships_store_role_check;
alter table public.offline_store_memberships
  add constraint offline_store_memberships_store_role_check
  check (store_role = any (array['manager','store_admin','inventory','cashier']));

create unique index if not exists offline_store_memberships_one_active_placement
  on public.offline_store_memberships(user_id) where is_active = true;

create table if not exists public.offline_store_job_titles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.offline_stores(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  permission_role text not null check (permission_role = any(array['store_admin','inventory','cashier'])),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists offline_store_job_titles_store_title_unique
  on public.offline_store_job_titles(store_id, lower(title));
alter table public.offline_store_job_titles enable row level security;
drop policy if exists offline_store_job_titles_read on public.offline_store_job_titles;
create policy offline_store_job_titles_read on public.offline_store_job_titles
  for select to authenticated using (private.offline_store_member(store_id, null));
drop policy if exists offline_store_job_titles_manager_write on public.offline_store_job_titles;
create policy offline_store_job_titles_manager_write on public.offline_store_job_titles
  for all to authenticated using (private.offline_store_member(store_id, array['manager']))
  with check (private.offline_store_member(store_id, array['manager']));

alter table public.offline_store_memberships
  drop constraint if exists offline_store_memberships_job_title_id_fkey;
alter table public.offline_store_memberships
  add constraint offline_store_memberships_job_title_id_fkey
  foreign key (job_title_id) references public.offline_store_job_titles(id) on delete set null;

create or replace function private.offline_store_member(p_store_id uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select coalesce(private.is_admin_or_owner(), false) or exists (
    select 1 from public.offline_store_memberships m
    join public.offline_stores s on s.id=m.store_id
    where m.store_id=p_store_id and m.user_id=auth.uid()
      and m.is_active and s.is_active
      and (p_roles is null or m.store_role=any(p_roles)
        or (m.store_role='store_admin' and 'manager'=any(p_roles)))
  )
$function$;

create or replace function public.create_offline_store(p_store_code text, p_name text, p_address text default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not private.is_admin_or_owner() then raise exception 'Hanya Owner/Admin aktif yang dapat membuat toko'; end if;
  if coalesce(trim(p_store_code),'')='' or coalesce(trim(p_name),'')='' then raise exception 'Kode dan nama toko wajib diisi'; end if;
  insert into public.offline_stores(store_code,name,address,created_by)
  values(upper(trim(p_store_code)),trim(p_name),nullif(trim(p_address),''),auth.uid()) returning id into v_id;
  insert into public.offline_store_discount_policies(store_id,updated_by) values(v_id,auth.uid()) on conflict(store_id) do nothing;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
  values(auth.uid(),'create','offline_stores',v_id::text,jsonb_build_object('store_code',upper(trim(p_store_code)),'name',trim(p_name)));
  return v_id;
end
$function$;

create or replace function public.list_offline_store_members(p_store_id uuid)
returns table (membership_id uuid, user_id uuid, email text, full_name text, store_role text, job_title text, job_title_id uuid, is_active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or not private.offline_store_member(p_store_id,array['manager']) then raise exception 'Hanya manajer toko atau Owner/Admin yang dapat melihat anggota toko'; end if;
  return query
  select m.id,m.user_id,p.email,p.full_name,m.store_role,
    coalesce(j.title,m.job_title,case m.store_role when 'manager' then 'Manajer Toko' when 'store_admin' then 'Admin Toko' when 'inventory' then 'Petugas Gudang' else 'Kasir' end),
    m.job_title_id,m.is_active,m.created_at
  from public.offline_store_memberships m join public.profiles p on p.id=m.user_id
  left join public.offline_store_job_titles j on j.id=m.job_title_id
  where m.store_id=p_store_id order by m.is_active desc,p.full_name nulls last,p.email;
end
$function$;

create or replace function public.manage_offline_store_member(p_membership_id uuid,p_store_role text,p_job_title_id uuid default null,p_is_active boolean default true)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v public.offline_store_memberships%rowtype; v_title public.offline_store_job_titles%rowtype;
begin
  if auth.uid() is null then raise exception 'Silakan login terlebih dahulu'; end if;
  select * into v from public.offline_store_memberships where id=p_membership_id for update;
  if not found then raise exception 'Keanggotaan toko tidak ditemukan'; end if;
  if not private.is_admin_or_owner() then
    if not private.offline_store_member(v.store_id,array['manager']) then raise exception 'Hanya manajer toko yang dapat mengatur anggota'; end if;
    if v.user_id=auth.uid() then raise exception 'Manajer tidak dapat mengubah atau menonaktifkan akses dirinya sendiri'; end if;
    if p_store_role not in ('store_admin','inventory','cashier') then raise exception 'Manajer hanya dapat menetapkan jabatan bawahan; hak Manajer/Owner/Admin tidak dapat diberikan dari sini'; end if;
    if not exists(select 1 from public.offline_store_memberships own where own.store_id=v.store_id and own.user_id=auth.uid() and own.is_active and own.store_role='manager') then raise exception 'Hanya Manajer Toko yang dapat mengatur jabatan bawahan'; end if;
  elsif p_store_role not in ('manager','store_admin','inventory','cashier') then raise exception 'Jabatan toko tidak valid';
  end if;
  if p_job_title_id is not null then
    select * into v_title from public.offline_store_job_titles where id=p_job_title_id and store_id=v.store_id and is_active;
    if not found then raise exception 'Jabatan tidak aktif atau bukan milik toko ini'; end if;
    if p_store_role<>v_title.permission_role then raise exception 'Peran akses harus sesuai dengan jabatan yang dipilih'; end if;
  end if;
  if p_is_active and exists(select 1 from public.offline_store_memberships other where other.user_id=v.user_id and other.is_active and other.id<>v.id) then
    raise exception 'Akun sudah memiliki penempatan aktif di toko lain. Nonaktifkan penempatan lama terlebih dahulu.';
  end if;
  update public.offline_store_memberships set store_role=p_store_role,job_title_id=p_job_title_id,
    job_title=case when p_job_title_id is null then null else v_title.title end,is_active=p_is_active where id=v.id;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
  values(auth.uid(),'update','offline_store_memberships',v.id::text,jsonb_build_object('store_id',v.store_id,'user_id',v.user_id,'store_role',p_store_role,'job_title_id',p_job_title_id,'is_active',p_is_active));
end
$function$;

create or replace function public.save_offline_store_job_title(p_store_id uuid,p_title text,p_permission_role text,p_title_id uuid default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_id uuid; v_old_title text;
begin
  if auth.uid() is null or not private.offline_store_member(p_store_id,array['manager']) then raise exception 'Hanya Manajer Toko atau Owner/Admin yang dapat mengelola jabatan'; end if;
  if coalesce(trim(p_title),'')='' or p_permission_role not in ('store_admin','inventory','cashier') then raise exception 'Nama jabatan atau kelompok akses tidak valid'; end if;
  if p_title_id is null then
    insert into public.offline_store_job_titles(store_id,title,permission_role,created_by) values(p_store_id,trim(p_title),p_permission_role,auth.uid()) returning id into v_id;
  else
    select title into v_old_title from public.offline_store_job_titles where id=p_title_id and store_id=p_store_id and is_active for update;
    if not found then raise exception 'Jabatan tidak ditemukan'; end if;
    update public.offline_store_job_titles set title=trim(p_title),permission_role=p_permission_role,updated_at=now() where id=p_title_id returning id into v_id;
    update public.offline_store_memberships set store_role=p_permission_role,job_title=trim(p_title) where store_id=p_store_id and job_title_id=v_id;
    insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),'update','offline_store_job_titles',v_id::text,jsonb_build_object('store_id',p_store_id,'old_title',v_old_title,'title',trim(p_title),'permission_role',p_permission_role));
    return v_id;
  end if;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),'create','offline_store_job_titles',v_id::text,jsonb_build_object('store_id',p_store_id,'title',trim(p_title),'permission_role',p_permission_role));
  return v_id;
end
$function$;

create or replace function public.deactivate_offline_store_job_title(p_title_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v public.offline_store_job_titles%rowtype;
begin
  select * into v from public.offline_store_job_titles where id=p_title_id for update;
  if not found or not private.offline_store_member(v.store_id,array['manager']) then raise exception 'Jabatan tidak ditemukan atau akses ditolak'; end if;
  update public.offline_store_job_titles set is_active=false,updated_at=now() where id=v.id;
  update public.offline_store_memberships set job_title_id=null,job_title=null,store_role=case when store_role='store_admin' then 'cashier' else store_role end where job_title_id=v.id;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),'deactivate','offline_store_job_titles',v.id::text,jsonb_build_object('store_id',v.store_id,'title',v.title));
end
$function$;

revoke all on function public.list_offline_store_members(uuid) from public,anon;
grant execute on function public.list_offline_store_members(uuid) to authenticated;
revoke all on function public.manage_offline_store_member(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.manage_offline_store_member(uuid,text,uuid,boolean) to authenticated;
revoke all on function public.save_offline_store_job_title(uuid,text,text,uuid) from public,anon;
grant execute on function public.save_offline_store_job_title(uuid,text,text,uuid) to authenticated;
revoke all on function public.deactivate_offline_store_job_title(uuid) from public,anon;
grant execute on function public.deactivate_offline_store_job_title(uuid) to authenticated;
