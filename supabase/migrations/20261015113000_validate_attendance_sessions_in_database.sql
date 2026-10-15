-- Enforce attendance session rules in the database instead of trusting browser-only checks.
CREATE OR REPLACE FUNCTION public.record_attendance(
  p_employee_id uuid,
  p_action text,
  p_evidence_path text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_employee_id uuid;
  v_attendance_id uuid;
  v_attendance_mode text;
  v_work_date date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_active_user() THEN
    RAISE EXCEPTION 'Akun tidak aktif atau belum memiliki akses';
  END IF;

  IF p_action NOT IN ('checkin', 'checkout') THEN
    RAISE EXCEPTION 'Tindakan absensi tidak valid';
  END IF;

  IF p_evidence_path IS NULL OR split_part(p_evidence_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Lokasi bukti absensi tidak valid';
  END IF;

  SELECT e.id INTO v_employee_id
  FROM public.employees e
  WHERE e.id = p_employee_id
    AND e.employment_status = 'active'
    AND (e.profile_id = auth.uid() OR private.is_hrd_or_admin_or_owner())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data karyawan aktif tidak ditemukan atau tidak dapat diakses';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employee_face_templates t
    WHERE t.employee_id = v_employee_id
      AND t.consent_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Template wajah dengan persetujuan wajib tersedia sebelum absensi';
  END IF;

  IF p_action = 'checkin' THEN
    IF EXISTS (
      SELECT 1 FROM public.attendance_records a
      WHERE a.employee_id = v_employee_id
        AND a.work_date = v_work_date
        AND a.check_out_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Masih ada sesi kerja aktif. Lakukan check-out terlebih dahulu';
    END IF;

    SELECT s.setting_value->>'mode' INTO v_attendance_mode
    FROM public.app_settings s
    WHERE s.setting_key = 'attendance_mode';

    IF coalesce(v_attendance_mode, 'once_daily') <> 'multiple_sessions'
       AND EXISTS (
         SELECT 1 FROM public.attendance_records a
         WHERE a.employee_id = v_employee_id
           AND a.work_date = v_work_date
       ) THEN
      RAISE EXCEPTION 'Mode Sekali Sehari aktif: karyawan sudah memiliki catatan absensi hari ini';
    END IF;

    INSERT INTO public.attendance_records (
      employee_id, work_date, check_in_at, check_in_method, status,
      recorded_by, evidence_path, evidence_expires_at
    )
    VALUES (
      v_employee_id, v_work_date, now(), 'face_match', 'present',
      auth.uid(), p_evidence_path, now() + interval '7 days'
    )
    RETURNING id INTO v_attendance_id;
    RETURN v_attendance_id;
  END IF;

  SELECT a.id INTO v_attendance_id
  FROM public.attendance_records a
  WHERE a.employee_id = v_employee_id
    AND a.work_date = v_work_date
    AND a.check_out_at IS NULL
  ORDER BY a.check_in_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tidak ada sesi aktif untuk check-out. Silakan check-in terlebih dahulu';
  END IF;

  UPDATE public.attendance_records
  SET check_out_at = now(),
      check_out_method = 'face_match',
      evidence_path = p_evidence_path,
      evidence_expires_at = now() + interval '7 days',
      updated_at = now()
  WHERE id = v_attendance_id;

  RETURN v_attendance_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_attendance(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_attendance(uuid, text, text) TO authenticated;

-- Employees must use the validated RPC; managers retain their explicit management policies.
DROP POLICY IF EXISTS attendance_employee_insert_own ON public.attendance_records;
DROP POLICY IF EXISTS attendance_employee_checkout_own ON public.attendance_records;
