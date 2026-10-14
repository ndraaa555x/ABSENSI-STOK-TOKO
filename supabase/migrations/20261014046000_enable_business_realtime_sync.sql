DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','product_orders','product_order_items','product_refunds',
    'financial_reports','financial_transactions','stock_movements',
    'notifications','leave_requests','attendance_records','employees'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
    END IF;
  END LOOP;
END $$;
