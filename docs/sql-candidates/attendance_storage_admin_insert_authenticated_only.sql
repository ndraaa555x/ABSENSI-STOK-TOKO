-- CANDIDATE ONLY — DO NOT APPLY TO PRODUCTION.
-- Prepared from the read-only Supabase audit on 2026-10-15.
-- Keep outside supabase/migrations until live migration history is reconciled,
-- a complete backup is restored in an isolated environment, and tests pass.
--
-- Finding: storage policy attendance_evidence_admin_insert currently targets
-- role PUBLIC. Its WITH CHECK calls private.is_admin_or_owner(), but the policy
-- should be defense-in-depth restricted to authenticated sessions.
--
-- Preconditions in the isolated test database:
--   1. Confirm this exact policy exists and matches the audited definition.
--   2. Confirm private.is_admin_or_owner() returns false when auth.uid() is NULL.
--   3. Confirm valid Owner/Admin can upload allowed attendance evidence.
--   4. Confirm HRD/Employee cannot upload through this admin-only policy.
--   5. Confirm anon cannot insert an object in attendance-evidence.
--   6. Confirm employee-own upload policy remains independently functional.
--
-- Apply only after the preconditions and regression tests pass.

begin;

drop policy if exists attendance_evidence_admin_insert on storage.objects;

create policy attendance_evidence_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'attendance-evidence'
  and private.is_admin_or_owner()
);

commit;

-- Rollback (only if required in isolated test and after review):
-- drop policy if exists attendance_evidence_admin_insert on storage.objects;
-- create policy attendance_evidence_admin_insert
-- on storage.objects for insert to public
-- with check (bucket_id = 'attendance-evidence' and private.is_admin_or_owner());
