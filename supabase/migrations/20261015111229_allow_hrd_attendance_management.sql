DROP POLICY IF EXISTS attendance_admin_insert ON public.attendance_records;
CREATE POLICY attendance_management_insert
ON public.attendance_records
FOR INSERT
TO authenticated
WITH CHECK ((SELECT private.is_hrd_or_admin_or_owner()));

DROP POLICY IF EXISTS attendance_admin_update ON public.attendance_records;
CREATE POLICY attendance_management_update
ON public.attendance_records
FOR UPDATE
TO authenticated
USING ((SELECT private.is_hrd_or_admin_or_owner()))
WITH CHECK ((SELECT private.is_hrd_or_admin_or_owner()));
