# SaaS Readiness — Work That Can Continue Without Vercel

Date: 2026-10-15
Organization pilot: NDRAAAID
Production domain/project: keep existing deployment and Supabase project
Status: investigation and planning only; no production schema, data, policies, storage, auth, domain, or deployment changes made by this document.

## Confirmed current state

- Public schema has 19 business tables and no `organization_id`, `tenant_id`, or `workspace_id` column.
- RLS is enabled on the existing 19 public tables (prior audit); the live catalog shows 68 policies in public and 7 policies on Storage.
- Current access rules are role/user based, not organization based. They cannot safely isolate multiple customer businesses.
- Existing Storage buckets are private: `attendance-evidence` and `order-payment-evidence`. Storage object bytes are not included in CSV exports.
- Two active Edge Functions were discovered:
  - `manage-employee-accounts` (JWT verification enabled, version 8)
  - `purge-attendance-evidence` (JWT verification enabled, version 1)
- The account-management Edge Function uses the service-role key on the server and validates the user's token and active profile. It includes role checks for listing/creating accounts; its full action list and organization scoping still need review before SaaS use.
- A catalog query found public functions that report EXECUTE privilege for `anon`: `approve_financial_report`, `create_product_with_stock`, `enforce_attendance_mode`, `fulfill_product_order`, `post_order_finance_on_approval`, `record_stock_movement`, `set_attendance_evidence_expiry`, `set_updated_at`, and `validate_product_order_item`.
- Most of those are not SECURITY DEFINER; several are trigger functions. This is a review queue, not proof of a directly exploitable endpoint. Do not bulk-revoke privileges without verifying trigger dependencies, actual RPC exposure, and intended behavior.
- `post_order_finance_on_approval()` is SECURITY DEFINER and its catalog ACL includes anon execution; it is also attached as a trigger to product order status changes. Review invocation exposure and trigger-only expectations carefully before changing grants.
- Some private-schema SECURITY DEFINER helpers have permissive EXECUTE ACLs in the catalog. Confirm schema exposure and actual call paths; do not assume private-schema functions are exposed by the REST API.
- Existing policy counts include overlapping permissive policies; do not drop policies automatically. Review each table's effective combined policy behavior.
- Full database backup and restore have not been verified. CSVs are not a complete backup; they omit schema, functions, triggers, policies, Auth setup and Storage file bytes.

## Required safe implementation sequence

1. **Baseline inventory** — export schema-only definitions for tables, constraints, indexes, triggers, functions, RLS policies, grants, storage buckets/policies, Auth settings, and Edge Function source. Record counts and hashes without publishing secrets or biometric data.
2. **Recoverability gate** — produce a complete database dump using Supabase CLI on a trusted computer, separately back up private Storage object bytes and required Auth/config metadata, then restore to an isolated disposable database/project and compare table counts and representative workflows. Do not use a CSV export as proof of recoverability.
3. **Tenant model review** — define organization membership and owner/admin/HRD/employee permissions; determine how a user can belong to multiple organizations; define the initial NDRAAAID ownership mapping for all existing rows before writing a migration.
4. **Draft migrations only on a feature branch** — add organizations and memberships; add nullable tenant keys; backfill every existing business row to NDRAAAID only after ownership has been verified; add organization-consistent foreign keys and uniqueness rules; only then consider NOT NULL constraints.
5. **RLS and Storage isolation** — every business table, child relation, view, RPC/function, notification, audit record, and Storage object must be organization scoped. Avoid trusting user-editable `user_metadata` for authorization. Service-role Edge Functions must derive the tenant from a validated membership and check every requested entity belongs to that tenant.
6. **Test matrix** — two test organizations, each with Owner/Admin/HRD/employee users. Test select/insert/update/delete and RPC access across organizations, related order items/refunds, financial reports/transactions, face templates, evidence uploads/downloads, and Edge Function actions. All cross-tenant access must be denied.
7. **Release gate** — code review, CI/lint/build, migration replay against a restored test database, Supabase security/performance advisors, backup restore confirmation, and explicit approval before any production migration. Do not merge or deploy just because Vercel becomes reachable.

## Items still requiring verification

- Map production's 24 migration-history entries to the repository migration files by SQL content and order. Repository main and feature branches differ; never replay a guessed migration sequence.
- Inspect every policy and function grant in context, including the exact HTTP/RPC surface, triggers, and Edge Function action branches.
- Inspect `purge-attendance-evidence` authorization, deletion boundaries, retention rules, and tenant-aware object paths.
- Inspect all frontend queries and routes to identify every tenant-scoped table access and every existing business workflow that must remain functional.
- Obtain and verify a complete backup/restore path. Vercel availability is not a prerequisite for these database and repository tasks.

## Production safety boundary

No SQL schema changes, grants, RLS policy changes, data backfills, account edits, Storage changes, production deployment, or domain changes are authorized by this audit document. The implementation is not SaaS-ready until tenant isolation and restoration tests pass.
