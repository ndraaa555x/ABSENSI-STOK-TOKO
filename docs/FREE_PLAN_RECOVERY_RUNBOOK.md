# Free-Plan Recovery Runbook (Before Any Production Changes)

Date: 2026-10-15  
Project: existing Supabase project `xgagttyxpngkjfowaasf`  
Application: existing Vercel project `smart-business-management`  
Repository: `ndraaa555x/ABSENSI-STOK-TOKO`  
Rule: do not change production schema, data, grants, RLS, storage, Auth, or deployment until a backup and restore test are proven.

## Why this is necessary

The Supabase Dashboard does not show a usable paid-plan backup for this project. The database currently has 19 public business tables, 68 public RLS policies, and a migration-history/repository mismatch (24 live migration-history entries vs 22 migration files in `saas-foundation`). No restore has been verified. CSV exports alone are not a complete backup.

## Manual backup on a trusted Windows computer

1. Install PostgreSQL command-line tools (matching or newer than the server major version) and the Supabase CLI. Do not install or run tools from an unknown download.
2. In the Supabase Dashboard for the existing project, open **Project Settings → Database** and obtain the database connection string. Prefer the direct connection when supported; otherwise use the documented session pooler connection. Do not put the password in GitHub, screenshots, chat, or a command saved in shell history.
3. Open PowerShell. Store the connection string in a temporary environment variable without committing it:
   ```powershell
   $env:SUPABASE_DB_URL = Read-Host "Paste database connection string (input may be visible)"
   ```
   Safer alternative: use a password prompt/credential manager and a connection string without a literal password. If the connection string includes a password, clear the variable after the dump and do not share terminal output.
4. Create a dated folder on an encrypted local drive with enough free space. Run a full custom-format database dump:
   ```powershell
   pg_dump --format=custom --no-owner --no-privileges --file="smart-business-management-2026-10-15.dump" "$env:SUPABASE_DB_URL"
   ```
   Then make a schema-only SQL dump for human review:
   ```powershell
   npx supabase db dump --db-url "$env:SUPABASE_DB_URL" --file "smart-business-management-schema-2026-10-15.sql"
   ```
   If either command fails, stop and fix the connection/tool issue. Do not treat a partial or zero-byte file as a backup.
5. Verify the dump file exists and is non-empty; record its size and SHA-256:
   ```powershell
   Get-Item .\smart-business-management-2026-10-15.dump
   Get-FileHash .\smart-business-management-2026-10-15.dump -Algorithm SHA256
   pg_restore --list .\smart-business-management-2026-10-15.dump
   ```
6. Keep a second encrypted copy in a separate location. Never upload database dumps to a public repository, issue, or shared chat.
7. Database dumps do not contain private Storage object bytes. Inventory both private buckets (`attendance-evidence`, `order-payment-evidence`), export/download each needed object using an authenticated supported Storage client, preserve object paths/metadata, and verify object counts and hashes. Treat attendance photos and face templates as sensitive personal data; restrict access and retain only what is necessary.
8. Auth users/settings and project-level configuration may need separate export/documentation. Never export or publish service-role keys. Record required Edge Function names/configuration and secret *names* only; restore secrets through the dashboard/secret manager, not a text file.
9. A dump is not proven recoverable until it is restored into an isolated disposable PostgreSQL/Supabase environment and table counts, constraints, policies, functions, triggers, and key workflows are checked. Do not restore over production.

## Production recovery gate

Mark the gate **PASS** only after all are true:
- Full database dump is non-empty and `pg_restore --list` succeeds.
- A second encrypted copy exists and SHA-256 is recorded.
- Required private Storage objects and metadata are separately copied and counted.
- Auth/config/Edge Function requirements are documented without exposing secrets.
- Restore test into an isolated environment succeeds; core row counts and schema objects are compared.
- Check-in/check-out, one-time face enrollment, product deletion, stock movement, order/refund finance posting, and role restrictions pass in the test environment.

Until then: **no production migration, bulk grant change, RLS rewrite, data backfill, SaaS tenant migration, domain change, or production deployment**.

## Audit findings that need a controlled fix

- Security Advisor reports `public.post_order_finance_on_approval()` is `SECURITY DEFINER` and executable by `anon` and `authenticated` through RPC, although it is also a trigger function. Do not bulk revoke or change its security mode without verifying trigger dependencies and all call paths. Prepare a narrow migration and test it in an isolated restore first.
- Security Advisor also flags authenticated execution of `set_product_stock`, `submit_product_order`, `submit_product_order_multi`, and `submit_product_refund` as SECURITY DEFINER RPCs. Verify authorization checks and intended caller roles function-by-function.
- Leaked-password protection is disabled. Enable it through Auth settings after confirming the setting and its user-facing effect; it is not a reason to interrupt production.
- Current public business tables do not have `organization_id`, `tenant_id`, `workspace_id`, or `company_id` columns. Existing policies are user/role based, not tenant-isolated. Do not claim SaaS multi-company readiness until ownership mapping and cross-tenant tests pass.
- The repository migration files do not exactly match the live migration history. Compare actual SQL definitions and dependencies before replaying or renaming any migration.

## Work order (parallelizable where safe)

1. Finish read-only catalog audit: RLS policies, SECURITY DEFINER function grants, triggers, storage policies/buckets, and Edge Function source.
2. Prepare and verify the manual backup and isolated restore.
3. Reconcile production migration history against SQL files and live definitions.
4. Reproduce/fix attendance and one-time face enrollment behavior in a test environment.
5. Verify product deletion really deletes the intended database row and handles foreign-key/stock constraints.
6. Fix security findings in isolated test environment; rerun security/performance advisors and workflow tests.
7. Design tenant membership and map all existing rows to the initial organization `NDRAAAID` only after ownership is verified.
8. Add tenant isolation to all tables, child relations, functions, Storage paths/policies, Edge Functions, and frontend data access; test with two organizations.
9. Review changes and CI, then require explicit production release approval.

## Scope of this branch

This document is a planning artifact only. It does not change production Supabase, production domain, Vercel project, or the `main` branch.
