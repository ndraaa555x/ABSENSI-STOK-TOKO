create or replace function public.assign_offline_store_member(p_store_id uuid,p_user_id uuid,p_store_role text,p_is_active boolean default true)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not private.is_admin_or_owner() then raise exception 'Hanya Owner/Admin aktif yang dapat menetapkan anggota toko'; end if;
  if p_store_role not in ('manager','store_admin','inventory','cashier') then raise exception 'Jabatan toko tidak valid'; end if;
  if not exists(select 1 from public.offline_stores where id=p_store_id and is_active) or not exists(select 1 from public.profiles where id=p_user_id and is_active) then raise exception 'Toko atau akun aktif tidak ditemukan'; end if;
  if p_is_active and exists(select 1 from public.offline_store_memberships m where m.user_id=p_user_id and m.is_active and m.store_id<>p_store_id) then raise exception 'Akun sudah memiliki penempatan aktif di toko lain. Nonaktifkan penempatan lama terlebih dahulu.'; end if;
  insert into public.offline_store_memberships(store_id,user_id,store_role,is_active,created_by,job_title_id,job_title)
  values(p_store_id,p_user_id,p_store_role,p_is_active,auth.uid(),null,case p_store_role when 'manager' then 'Manajer Toko' when 'store_admin' then 'Admin Toko' when 'inventory' then 'Petugas Gudang' else 'Kasir' end)
  on conflict(store_id,user_id) do update set store_role=excluded.store_role,is_active=excluded.is_active,job_title_id=null,job_title=excluded.job_title
  returning id into v_id;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),'assign','offline_store_memberships',v_id::text,jsonb_build_object('store_id',p_store_id,'user_id',p_user_id,'store_role',p_store_role,'is_active',p_is_active));
  return v_id;
end
$function$;

insert into public.offline_store_job_titles(store_id,title,permission_role,created_by)
select s.id, defaults.title, defaults.permission_role, s.created_by
from public.offline_stores s
cross join (values ('Admin Toko','store_admin'),('Petugas Gudang','inventory'),('Kasir','cashier')) as defaults(title,permission_role)
where not exists (select 1 from public.offline_store_job_titles j where j.store_id=s.id and lower(j.title)=lower(defaults.title));

update public.offline_store_memberships m
set job_title_id=j.id, job_title=j.title
from public.offline_store_job_titles j
where m.store_id=j.store_id and m.job_title_id is null
  and ((m.store_role='store_admin' and j.permission_role='store_admin' and lower(j.title)='admin toko')
    or (m.store_role='inventory' and j.permission_role='inventory' and lower(j.title)='petugas gudang')
    or (m.store_role='cashier' and j.permission_role='cashier' and lower(j.title)='kasir'));

revoke all on function public.assign_offline_store_member(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.assign_offline_store_member(uuid,uuid,text,boolean) to authenticated;
