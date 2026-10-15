drop index if exists public.offline_store_job_titles_store_title_unique;
create unique index offline_store_job_titles_store_title_unique
on public.offline_store_job_titles(store_id,lower(title)) where is_active=true;

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
  if exists(select 1 from public.offline_store_memberships m where m.job_title_id=v.id and m.is_active) then
    raise exception 'Pindahkan anggota aktif ke jabatan lain sebelum menonaktifkan jabatan ini.';
  end if;
  update public.offline_store_job_titles set is_active=false,updated_at=now() where id=v.id;
  insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
  values(auth.uid(),'deactivate','offline_store_job_titles',v.id::text,jsonb_build_object('store_id',v.store_id,'title',v.title));
end
$function$;
