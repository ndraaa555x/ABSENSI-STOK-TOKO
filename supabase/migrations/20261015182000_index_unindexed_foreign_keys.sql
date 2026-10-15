-- Add leading-column indexes for foreign keys that lack a supporting non-partial index.
do $$
declare
 r record;
 v_cols text;
 v_idx text;
begin
 for r in
   select con.oid, con.conname, c.relname as table_name, n.nspname as schema_name,
          con.conkey, cardinality(con.conkey) as key_count,
          (select array_agg(a.attname order by u.ord)
           from unnest(con.conkey) with ordinality u(attnum,ord)
           join pg_attribute a on a.attrelid=c.oid and a.attnum=u.attnum) as col_names
   from pg_constraint con
   join pg_class c on c.oid=con.conrelid
   join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and con.contype='f'
     and not exists (
       select 1 from pg_index ix
       where ix.indrelid=c.oid and ix.indisvalid and ix.indisready
         and ix.indpred is null and ix.indexprs is null
         and ix.indnkeyatts >= cardinality(con.conkey)
         and (select array_agg(k::smallint order by ord)
              from unnest(ix.indkey::smallint[]) with ordinality x(k,ord)
              where ord <= cardinality(con.conkey)) = con.conkey
     )
 loop
   select string_agg(format('%I', x), ', ' order by ord)
     into v_cols
   from unnest(r.col_names) with ordinality u(x,ord);
   v_idx := left(r.table_name, 38) || '_' || substr(md5(r.conname),1,8) || '_fk_idx';
   execute format('create index if not exists %I on %I.%I (%s)', v_idx, r.schema_name, r.table_name, v_cols);
 end loop;
end $$;
