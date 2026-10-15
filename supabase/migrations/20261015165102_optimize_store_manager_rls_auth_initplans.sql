-- Avoid per-row re-evaluation of auth.uid() in store manager RLS policies.
do $$
declare r record; v_sql text;
begin
 for r in
   select schemaname, tablename, policyname, qual, with_check
   from pg_policies
   where schemaname='public'
     and (tablename, policyname) in (
       ('offline_stores','offline_stores_read'),
       ('offline_store_job_titles','offline_store_job_titles_manager_write'),
       ('attendance_records','attendance_store_manager_select'),
       ('attendance_records','attendance_store_manager_insert'),
       ('attendance_records','attendance_store_manager_update'),
       ('employees','employees_store_manager_select')
     )
 loop
   v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
   if r.qual is not null then
     v_sql := v_sql || ' using (' || replace(r.qual, 'auth.uid()', '(select auth.uid())') || ')';
   end if;
   if r.with_check is not null then
     v_sql := v_sql || ' with check (' || replace(r.with_check, 'auth.uid()', '(select auth.uid())') || ')';
   end if;
   execute v_sql;
 end loop;
end $$;
