-- Configurable attendance sessions: once daily or multiple sessions after checkout.
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_one_record_per_day;

CREATE INDEX IF NOT EXISTS attendance_employee_date_idx
  ON public.attendance_records (employee_id, work_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_one_open_session_per_employee
  ON public.attendance_records (employee_id)
  WHERE check_out_at IS NULL;

DROP POLICY IF EXISTS settings_attendance_mode_read ON public.app_settings;
CREATE POLICY settings_attendance_mode_read
  ON public.app_settings
  FOR SELECT TO authenticated
  USING (setting_key = 'attendance_mode');

DROP POLICY IF EXISTS settings_attendance_mode_insert ON public.app_settings;
CREATE POLICY settings_attendance_mode_insert
  ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    setting_key = 'attendance_mode'
    AND (SELECT private.is_admin_or_owner())
  );

DROP POLICY IF EXISTS settings_attendance_mode_update ON public.app_settings;
CREATE POLICY settings_attendance_mode_update
  ON public.app_settings
  FOR UPDATE TO authenticated
  USING (
    setting_key = 'attendance_mode'
    AND (SELECT private.is_admin_or_owner())
  )
  WITH CHECK (
    setting_key = 'attendance_mode'
    AND (SELECT private.is_admin_or_owner())
  );

CREATE OR REPLACE FUNCTION public.enforce_attendance_mode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
DECLARE
  v_mode text;
  v_conflict boolean;
BEGIN
  SELECT COALESCE(setting_value->>'mode', 'once_daily')
    INTO v_mode
    FROM public.app_settings
    WHERE setting_key = 'attendance_mode';

  IF v_mode = 'multiple_sessions' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.attendance_records ar
      WHERE ar.employee_id = NEW.employee_id
        AND ar.work_date = NEW.work_date
        AND ar.check_out_at IS NULL
    ) INTO v_conflict;

    IF v_conflict THEN
      RAISE EXCEPTION 'Sesi kerja masih aktif. Check-out terlebih dahulu sebelum Check-in lagi.';
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.attendance_records ar
      WHERE ar.employee_id = NEW.employee_id
        AND ar.work_date = NEW.work_date
    ) INTO v_conflict;

    IF v_conflict THEN
      RAISE EXCEPTION 'Mode Sekali Sehari aktif: sudah ada catatan absensi pada tanggal ini.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_mode_guard ON public.attendance_records;
CREATE TRIGGER attendance_mode_guard
  BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_mode();
