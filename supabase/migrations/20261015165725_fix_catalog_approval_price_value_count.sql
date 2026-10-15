-- Correct the approval RPC to set the central sale price without adding an extra VALUES expression.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.review_offline_product_submission(uuid,text,text,boolean)'::regprocedure) into v_def;
  if position('v.proposed_description,v.proposed_sale_price,0,0,0,true,auth.uid()' in v_def)=0 then
    raise exception 'Could not locate malformed catalog price assignment; aborting correction';
  end if;
  v_def := replace(
    v_def,
    'v.proposed_description,v.proposed_sale_price,0,0,0,true,auth.uid()',
    'v.proposed_description,v.proposed_sale_price,0,0,true,auth.uid()'
  );
  execute v_def;
end $$;
