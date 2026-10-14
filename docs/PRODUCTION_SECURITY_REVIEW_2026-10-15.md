# Production security review — 2026-10-15

Scope: read-only inspection of the current Supabase production catalog. No production schema, data, grants, policies, or storage objects were changed during this review.

## Verified status

- GitHub Actions validation for `saas-foundation` run [38604601403](https://github.com/ndraaa555x/ABSENSI-STOK-TOKO/actions/runs/38604601403) completed successfully: dependency installation, lint, and build all passed.
- All 19 public application tables currently have RLS enabled (prior audit).
- The `private` schema denies USAGE to `anon`; therefore helper functions that show inherited/explicit anon EXECUTE should not be treated as anonymously callable through normal schema-qualified API access without additional exposure evidence.
- The two storage buckets remain private. Existing storage policies were inspected read-only.

## Findings to address before SaaS rollout

### 1. Tenant isolation is not implemented
No tenant/organization ownership key exists in the 19 public business tables. Current role and user ownership policies are not sufficient to isolate multiple customer organizations. Do not onboard separate businesses until the tenant model, foreign keys, policies, RPCs, storage paths, and automated cross-tenant denial tests are implemented.

### 2. Trigger function has unnecessary execute grants
`public.post_order_finance_on_approval()` is SECURITY DEFINER and currently reports EXECUTE for `anon` and `authenticated`. Its return type is `trigger`, so it is a trigger function rather than an ordinary callable RPC; this is not proof of an exploitable anonymous RPC. Still, review and remove unnecessary direct grants in a controlled migration after verifying its trigger dependency and permissions.

### 3. Attendance evidence INSERT policy targets PUBLIC
Storage policy `attendance_evidence_admin_insert` has role `public` and a predicate requiring `private.is_admin_or_owner()`. The predicate should reject unauthenticated callers, but the policy target should be narrowed to `authenticated` as defense in depth. Verify the helper's null-user behavior and test anon rejection before changing it.

### 4. Storage path ownership is user-scoped, not tenant-scoped
Policies for `attendance-evidence` and `order-payment-evidence` use the first folder component as a user UUID, with an admin override for attendance evidence. This must be redesigned alongside tenant ownership before SaaS onboarding; do not simply change folder names without migrating existing object paths and testing signed URL/access behavior.

### 5. Backup and restore are still a release blocker
CSV exports and repository ZIP do not include a complete restorable database, auth configuration, functions/triggers/policies, or storage binaries. A full database dump plus storage-object backup and a successful restore test have not been verified. Do not merge SaaS schema work or alter production until that recovery path is tested.

## Safe next sequence

1. Obtain a full database dump using the supported Supabase CLI/connection on a trusted computer; keep credentials and biometric exports private.
2. Back up both private storage buckets separately and record object counts/checksums.
3. Restore the database and storage into an isolated test environment and verify row counts, functions, triggers, RLS, auth relationships, and app smoke tests.
4. Resolve the production-vs-repository migration history mismatch before replaying or generating migrations.
5. Implement tenant ownership and isolation on a non-production branch/environment; test cross-tenant reads, writes, RPCs, and storage access.
6. Review narrow security fixes, including the storage policy role and trigger-function grants, in a separate migration with regression tests.
7. Only after all gates pass, prepare a reviewed deployment and rollback plan.

## Guardrail

This document is an audit record, not permission to change production. No production data or schema was modified as part of this review.
