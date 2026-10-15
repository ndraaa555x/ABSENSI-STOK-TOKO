-- Tighten team-management RPCs: store-admin permissions do not imply manager permissions.
create or replace function public.list_offline_store_members(p_store_id uuid)
returns table (membership_id uuid,user_id uuid,email text,full_name text,store_role text,job_title text,job_title_id uuid,is_active boolean,created_at timestamptz)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or not (private.is_admin_or_owner() or exists (
    select 1 from public.offline_store_memberships m join public.offline_stores s on s.id=m.store_id
    where m.store_id=p_store_id and m.user_id=auth.uid() and m.is_active and m.store_role='manager' and s.is_active
  )) then raise exception 'Hanya Manajer Toko atau Owner/Admin yang dapat melihat anggota toko'; end if;
  return query select m.id,m.user_id,p.email,p.full_name,m.store_role,
    coalesce(j.title,m.job_title,case m.store_role when 'manager' then 'Manajer Toko' when 'store_admin' then 'Admin Toko' when 'inventory' then 'Petugas Gudang' else 'Kasir' end),
    m.job_title_id,m.is_active,m.created_at
  from public.offline_store_memberships m join public.profiles p on p.id=m.user_id
  left join public.offline_store_job_titles j on j.id=m.job_title_id
  where m.store_id=p_store_id order by m.is_active desc,p.full_name nulls last,p.email;
end
$function$;

create or replace function public.save_offline_store_job_title(p_store_id uuid,p_title text,p_permission_role text,p_title_id uuid default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_id uuid; v_old_title text;
begin
  if auth.uid() is null or not (private.is_admin_or_owner() or exists (
    select 1 from public.offline_store_memberships m join public.offline_stores s on s.id=m.store_id
    where m.store_id=p_store_id and m.user_id=auth.uid() and m.is_active and m.store_role='manager' and s.is_active
  )) then raise exception 'Hanya Manajer Toko atau Owner/Admin yang dapat mengelola jabatan'; end if;
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
  if not found or not (private.is_admin_or_owner() or exists (
    select 1 from public.offline_store_memberships m join public.offline_stores s on s.id=m.store_id
    where m.store_id=v.store_id and m.user_id=auth.uid() and m.is_active and m.store_role='manager' and s.is_active
  )) then raise exception 'Jabatan tidak ditemukan atau akses ditolak'; end if;
  update public.offline_store_job_titles set is_active=false,updated_at=now() where id=v.id;
  update public.offline_store_memberships set job_title_id=null,job_title=null,store_role=case when store_role='store_admin' then 'cashier' else store_role end where job_title_id=v.id;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),'deactivate','offline_store_job_titles',v.id::text,jsonb_build_object('store_id',v.store_id,'title',v.title));
end
$function$;
