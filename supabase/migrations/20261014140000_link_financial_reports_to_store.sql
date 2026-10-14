-- Make each financial report traceable to a specific store/customer.
ALTER TABLE public.financial_reports
  ADD COLUMN IF NOT EXISTS related_customer_id uuid REFERENCES public.business_customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS financial_reports_related_customer_idx
  ON public.financial_reports(related_customer_id);
