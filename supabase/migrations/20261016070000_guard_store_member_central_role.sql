-- Keep central account roles separate from store job titles.
-- Store managers/cashiers/inventory/admin staff must have the central employee role.
-- Owner/Admin/HRD retain store oversight through central permissions, not memberships.
do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.assign_offline_store_member(uuid,uuid,text,boolean)'::regprocedure)
    into v_def;
  v_old := 'if not exists(select 1 from public.offline_stores where id=p_store_id and is_active) or not exists(select 1 from public.profiles where id=p_user_id and is_active) then raise exception ''Toko atau akun aktif tidak ditemukan''; end if;';
  v_new := v_old || E'\n  if not exists(select 1 from public.profiles where id=p_user_id and is_active and role=''employee'') then raise exception ''Anggota Toko Offline harus memakai role pusat Karyawan. Ubah role akun melalui Owner/Admin terlebih dahulu.''; end if;';
  if position(v_old in v_def) = 0 then
    raise exception 'Expected validation point not found in assign_offline_store_member; migration stopped';
  end if;
  execute replace(v_def, v_old, v_new);

  select pg_get_functiondef('public.manage_offline_store_member(uuid,text,uuid,boolean)'::regprocedure)
    into v_def;
  v_old := 'if p_is_active and exists(select 1 from public.offline_store_memberships other';
  v_new := E'if p_is_active and not exists(select 1 from public.profiles where id=v.user_id and is_active and role=''employee'') then raise exception ''Anggota Toko Offline harus memakai role pusat Karyawan. Ubah role akun melalui Owner/Admin terlebih dahulu.''; end if;\n  ' || v_old;
  if position(v_old in v_def) = 0 then
    raise exception 'Expected validation point not found in manage_offline_store_member; migration stopped';
  end if;
  execute replace(v_def, v_old, v_new);
end
$migration$;
