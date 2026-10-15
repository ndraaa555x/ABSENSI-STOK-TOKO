create or replace function public.create_offline_store(p_store_code text,p_name text,p_address text default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not private.is_admin_or_owner() then raise exception 'Hanya Owner/Admin aktif yang dapat membuat toko'; end if;
  if coalesce(trim(p_store_code),'')='' or coalesce(trim(p_name),'')='' then raise exception 'Kode dan nama toko wajib diisi'; end if;
  insert into public.offline_stores(store_code,name,address,created_by)
  values(upper(trim(p_store_code)),trim(p_name),nullif(trim(p_address),''),auth.uid()) returning id into v_id;
  insert into public.offline_store_discount_policies(store_id,updated_by) values(v_id,auth.uid()) on conflict(store_id) do nothing;
  insert into public.offline_store_job_titles(store_id,title,permission_role,created_by)
  values(v_id,'Admin Toko','store_admin',auth.uid()),(v_id,'Petugas Gudang','inventory',auth.uid()),(v_id,'Kasir','cashier',auth.uid());
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
  values(auth.uid(),'create','offline_stores',v_id::text,jsonb_build_object('store_code',upper(trim(p_store_code)),'name',trim(p_name)));
  return v_id;
end
$function$;

create or replace function public.assign_offline_store_member(p_store_id uuid,p_user_id uuid,p_store_role text,p_is_active boolean default true)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_id uuid; v_title_id uuid; v_title text;
begin
  if auth.uid() is null or not private.is_admin_or_owner() then raise exception 'Hanya Owner/Admin aktif yang dapat menetapkan anggota toko'; end if;
  if p_store_role not in ('manager','store_admin','inventory','cashier') then raise exception 'Jabatan toko tidak valid'; end if;
  if not exists(select 1 from public.offline_stores where id=p_store_id and is_active) or not exists(select 1 from public.profiles where id=p_user_id and is_active) then raise exception 'Toko atau akun aktif tidak ditemukan'; end if;
  if p_is_active and exists(select 1 from public.offline_store_memberships m where m.user_id=p_user_id and m.is_active and m.store_id<>p_store_id) then raise exception 'Akun sudah memiliki penempatan aktif di toko lain. Nonaktifkan penempatan lama terlebih dahulu.'; end if;
  if p_store_role<>'manager' then
    select j.id,j.title into v_title_id,v_title from public.offline_store_job_titles j
    where j.store_id=p_store_id and j.permission_role=p_store_role and j.is_active
    order by case when lower(j.title)=case p_store_role when 'store_admin' then 'admin toko' when 'inventory' then 'petugas gudang' else 'kasir' end then 0 else 1 end,j.created_at
    limit 1;
  end if;
  insert into public.offline_store_memberships(store_id,user_id,store_role,is_active,created_by,job_title_id,job_title)
  values(p_store_id,p_user_id,p_store_role,p_is_active,auth.uid(),v_title_id,
    coalesce(v_title,case p_store_role when 'manager' then 'Manajer Toko' when 'store_admin' then 'Admin Toko' when 'inventory' then 'Petugas Gudang' else 'Kasir' end))
  on conflict(store_id,user_id) do update set store_role=excluded.store_role,is_active=excluded.is_active,job_title_id=excluded.job_title_id,job_title=excluded.job_title
  returning id into v_id;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
  values(auth.uid(),'assign','offline_store_memberships',v_id::text,jsonb_build_object('store_id',p_store_id,'user_id',p_user_id,'store_role',p_store_role,'is_active',p_is_active));
  return v_id;
end
$function$;
