-- Allow trusted Owner/Admin users to upload private attendance evidence.
-- Existing employee-own upload/read policies remain unchanged.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'attendance_evidence_admin_insert'
  ) THEN
    CREATE POLICY attendance_evidence_admin_insert
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'attendance-evidence'
        AND private.is_admin_or_owner()
      );
  END IF;
END $$;
