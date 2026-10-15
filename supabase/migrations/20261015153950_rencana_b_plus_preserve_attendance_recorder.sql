create or replace function public.update_offline_store_team_attendance(p_attendance_id uuid,p_status text,p_notes text default null)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_record public.attendance_records%rowtype; v_store_id uuid;
begin
  if auth.uid() is null then raise exception 'Silakan login terlebih dahulu'; end if;
  if p_status not in ('present','late','leave','sick','absent','holiday') then raise exception 'Status absensi tidak valid'; end if;
  select a.* into v_record from public.attendance_records a where a.id=p_attendance_id for update;
  if not found then raise exception 'Catatan absensi tidak ditemukan'; end if;
  select tm.store_id into v_store_id
  from public.employees e
  join public.offline_store_memberships tm on tm.user_id=e.profile_id and tm.is_active
  join public.offline_stores s on s.id=tm.store_id and s.is_active
  join public.offline_store_memberships manager on manager.store_id=tm.store_id and manager.user_id=auth.uid() and manager.is_active and manager.store_role='manager'
  where e.id=v_record.employee_id limit 1;
  if v_store_id is null and not private.is_admin_or_owner() then raise exception 'Manajer hanya dapat mengubah absensi anggota toko sendiri'; end if;
  update public.attendance_records set status=p_status,notes=nullif(trim(p_notes),'') where id=p_attendance_id;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
  values(auth.uid(),'update','attendance_records',p_attendance_id::text,jsonb_build_object('store_id',v_store_id,'employee_id',v_record.employee_id,'work_date',v_record.work_date,'status',p_status));
end
$function$;
revoke all on function public.update_offline_store_team_attendance(uuid,text,text) from public,anon;
grant execute on function public.update_offline_store_team_attendance(uuid,text,text) to authenticated;
