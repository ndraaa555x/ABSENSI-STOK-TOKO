-- Order payment evidence, stock reservation and refund/report store linkage.
-- Database implementation is applied in Supabase project xgagttyxpngkjfowaasf.
ALTER TABLE public.product_orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_evidence_path text,
  ADD COLUMN IF NOT EXISTS stock_reserved boolean NOT NULL DEFAULT false;
ALTER TABLE public.financial_reports
  ADD COLUMN IF NOT EXISTS related_order_id uuid REFERENCES public.product_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS product_orders_customer_created_idx ON public.product_orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_reports_related_order_idx ON public.financial_reports(related_order_id);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('order-payment-evidence','order-payment-evidence',false,3145728,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=3145728,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
