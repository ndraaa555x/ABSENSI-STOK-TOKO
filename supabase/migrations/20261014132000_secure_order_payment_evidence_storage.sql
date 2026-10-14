-- Keep payment proof photos private; employees can upload and read only their own folder,
-- while Admin/Owner can read all evidence through the authenticated app.
DROP POLICY IF EXISTS "order_evidence_upload_own_folder" ON storage.objects;
CREATE POLICY "order_evidence_upload_own_folder" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id='order-payment-evidence' AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS "order_evidence_read_own_or_admin" ON storage.objects;
CREATE POLICY "order_evidence_read_own_or_admin" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id='order-payment-evidence' AND ((storage.foldername(name))[1]=auth.uid()::text OR private.is_admin_or_owner()));
