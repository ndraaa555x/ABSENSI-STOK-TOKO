-- Keep the store manager's display title explicit while preserving the separate
-- global account role and the special store_role='manager' permission boundary.
CREATE OR REPLACE FUNCTION private.manage_offline_store_member(
  p_membership_id uuid,
  p_store_role text,
  p_job_title_id uuid DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v public.offline_store_memberships%rowtype;
  v_title public.offline_store_job_titles%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu';
  END IF;

  SELECT * INTO v
  FROM public.offline_store_memberships
  WHERE id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Keanggotaan toko tidak ditemukan';
  END IF;

  IF NOT private.is_admin_or_owner() THEN
    IF NOT private.offline_store_member(v.store_id, ARRAY['manager']) THEN
      RAISE EXCEPTION 'Hanya manajer toko yang dapat mengatur anggota';
    END IF;
    IF v.user_id = auth.uid() THEN
      RAISE EXCEPTION 'Manajer tidak dapat mengubah atau menonaktifkan akses dirinya sendiri';
    END IF;
    IF p_store_role NOT IN ('store_admin','inventory','cashier') THEN
      RAISE EXCEPTION 'Manajer hanya dapat menetapkan jabatan bawahan; hak Manajer/Owner/Admin tidak dapat diberikan dari sini';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.offline_store_memberships own
      WHERE own.store_id = v.store_id
        AND own.user_id = auth.uid()
        AND own.is_active
        AND own.store_role = 'manager'
    ) THEN
      RAISE EXCEPTION 'Hanya Manajer Toko yang dapat mengatur jabatan bawahan';
    END IF;
  ELSIF p_store_role NOT IN ('manager','store_admin','inventory','cashier') THEN
    RAISE EXCEPTION 'Jabatan toko tidak valid';
  END IF;

  IF p_job_title_id IS NOT NULL THEN
    SELECT * INTO v_title
    FROM public.offline_store_job_titles
    WHERE id = p_job_title_id
      AND store_id = v.store_id
      AND is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Jabatan tidak aktif atau bukan milik toko ini';
    END IF;
    IF p_store_role <> v_title.permission_role THEN
      RAISE EXCEPTION 'Peran akses harus sesuai dengan jabatan yang dipilih';
    END IF;
  END IF;

  IF p_is_active AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v.user_id AND is_active AND role = 'employee'
  ) THEN
    RAISE EXCEPTION 'Anggota Toko Offline harus memakai role pusat Karyawan. Ubah role akun melalui Owner/Admin terlebih dahulu.';
  END IF;

  IF p_is_active AND EXISTS (
    SELECT 1 FROM public.offline_store_memberships other
    WHERE other.user_id = v.user_id
      AND other.is_active
      AND other.id <> v.id
  ) THEN
    RAISE EXCEPTION 'Akun sudah memiliki penempatan aktif di toko lain. Nonaktifkan penempatan lama terlebih dahulu.';
  END IF;

  UPDATE public.offline_store_memberships
  SET store_role = p_store_role,
      job_title_id = p_job_title_id,
      job_title = CASE
        WHEN p_job_title_id IS NOT NULL THEN v_title.title
        WHEN p_store_role = 'manager' THEN 'Manajer Toko'
        ELSE NULL
      END,
      is_active = p_is_active
  WHERE id = v.id;

  INSERT INTO public.audit_logs(actor_id, action, entity_table, entity_id, details)
  VALUES (
    auth.uid(),
    'update',
    'offline_store_memberships',
    v.id::text,
    jsonb_build_object(
      'store_id', v.store_id,
      'user_id', v.user_id,
      'store_role', p_store_role,
      'job_title_id', p_job_title_id,
      'is_active', p_is_active
    )
  );
END
$function$;

UPDATE public.offline_store_memberships
SET job_title = 'Manajer Toko'
WHERE is_active = true
  AND store_role = 'manager'
  AND job_title_id IS NULL
  AND COALESCE(job_title, '') = '';