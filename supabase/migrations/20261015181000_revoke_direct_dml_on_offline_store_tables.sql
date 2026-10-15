-- All offline-store writes must go through server-side RPCs that validate store and role.
do $$
declare t record;
begin
 for t in
   select c.relname
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relname like 'offline\_%' escape '\'
 loop
   execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from anon, authenticated, public', t.relname);
 end loop;
end $$;
