-- HRD is allowed to manage attendance records in the application, so allow HRD to upload/read evidence for that workflow.
DROP POLICY IF EXISTS attendance_evidence_admin_insert ON storage.objects;
CREATE POLICY attendance_evidence_management_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'attendance-evidence'
  AND private.is_hrd_or_admin_or_owner()
);

DROP POLICY IF EXISTS attendance_evidence_admin_read ON storage.objects;
DROP POLICY IF EXISTS attendance_evidence_employee_read_own ON storage.objects;
CREATE POLICY attendance_evidence_management_or_employee_read
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attendance-evidence'
  AND (
    private.is_hrd_or_admin_or_owner()
    OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
);
