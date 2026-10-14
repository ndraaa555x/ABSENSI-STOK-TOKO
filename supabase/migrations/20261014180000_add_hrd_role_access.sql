-- SMART BUSINESS MANAGEMENT: role HRD and people-operations access
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner','admin','hrd','employee'));

CREATE OR REPLACE FUNCTION private.is_hrd_or_admin_or_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
      AND p.role IN ('owner','admin','hrd')
  );
$$;
GRANT EXECUTE ON FUNCTION private.is_hrd_or_admin_or_owner() TO authenticated;

DROP POLICY IF EXISTS employees_hrd_select ON public.employees;
CREATE POLICY employees_hrd_select ON public.employees FOR SELECT TO authenticated
  USING (private.is_hrd_or_admin_or_owner());
DROP POLICY IF EXISTS employees_hrd_insert ON public.employees;
CREATE POLICY employees_hrd_insert ON public.employees FOR INSERT TO authenticated
  WITH CHECK (private.is_hrd_or_admin_or_owner());
DROP POLICY IF EXISTS employees_hrd_update ON public.employees;
CREATE POLICY employees_hrd_update ON public.employees FOR UPDATE TO authenticated
  USING (private.is_hrd_or_admin_or_owner()) WITH CHECK (private.is_hrd_or_admin_or_owner());

DROP POLICY IF EXISTS attendance_hrd_select ON public.attendance_records;
CREATE POLICY attendance_hrd_select ON public.attendance_records FOR SELECT TO authenticated
  USING (private.is_hrd_or_admin_or_owner());

DROP POLICY IF EXISTS leave_hrd_select ON public.leave_requests;
CREATE POLICY leave_hrd_select ON public.leave_requests FOR SELECT TO authenticated
  USING (private.is_hrd_or_admin_or_owner());
DROP POLICY IF EXISTS leave_hrd_update ON public.leave_requests;
CREATE POLICY leave_hrd_update ON public.leave_requests FOR UPDATE TO authenticated
  USING (private.is_hrd_or_admin_or_owner()) WITH CHECK (private.is_hrd_or_admin_or_owner());

DROP POLICY IF EXISTS face_templates_hrd_all ON public.employee_face_templates;
CREATE POLICY face_templates_hrd_all ON public.employee_face_templates FOR ALL TO authenticated
  USING (private.is_hrd_or_admin_or_owner()) WITH CHECK (private.is_hrd_or_admin_or_owner());
