-- Ensure the central catalog insert uses exactly one sale_price value.
-- No-op if the earlier migration already contains the corrected expression.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.review_offline_product_submission(uuid,text,text,boolean)'::regprocedure) into v_def;
  if position('v.proposed_description,v.proposed_sale_price,0,0,0,true,auth.uid()' in v_def)>0 then
    execute replace(v_def,
      'v.proposed_description,v.proposed_sale_price,0,0,0,true,auth.uid()',
      'v.proposed_description,v.proposed_sale_price,0,0,true,auth.uid()');
  end if;
end $$;
