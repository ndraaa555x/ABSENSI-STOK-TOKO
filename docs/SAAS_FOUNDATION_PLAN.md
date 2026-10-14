# SMART BUSINESS MANAGEMENT SaaS Foundation Plan

Status: audit-first proposal. This document does not apply production database or application changes.

## Constraints
- Keep the current production domain: https://smart-business-management-red.vercel.app/
- Reuse the existing GitHub repository, Supabase project, and Vercel project.
- Preserve branch KEMBALIKAN.
- Do not enable customer self-signup or sell subscriptions until tenant isolation is implemented and tested.
- Do not assume existing business rows belong to a new tenant until the owner mapping is verified.
- Keep all schema and application changes staged on a feature branch and review before production rollout.

## Audit findings (2026-10-14)
- Repository: ndraaa555x/ABSENSI-STOK-TOKO, branch main.
- Supabase project: xgagttyxpngkjfowaasf.
- Existing profile roles: owner, admin, hrd, employee.
- Current public business tables have RLS enabled, but inspected policies and helper functions authorize by global profile role and do not yet scope records to an organization.
- No organization_id/tenant_id columns were found in the inspected public schema.
- Existing profile count: 4 (one account per current role); employees: 3; attendance_records: 1; products: 1; product_orders: 2; financial_transactions: 2; audit_logs: 41.
- Current app uses a fixed Role union and fixed roleModules map in app/page.tsx; custom permission UI is not yet present.
- Supabase security advisor reported callable SECURITY DEFINER functions in public, including post_order_finance_on_approval; this needs review before onboarding external tenants. Leaked-password protection is also reported disabled.
- Vercel deployment limit previously blocked a deployment; do not promise a production release until deployment capability is verified.

## Target architecture
1. organizations: one record per customer company, lifecycle status and owner metadata.
2. organization_members: links auth users/profiles to an organization with membership status; a user must not self-assign platform-admin privileges.
3. organization_settings: per-company name/logo/theme and business preferences.
4. subscription_plans and subscriptions: plan limits, billing interval, status, current period, grace/expiry handling.
5. organization_domains: validated customer-owned custom domains and/or platform-managed subdomains.
6. permissions, roles, role_permissions, user_roles: platform-managed permission catalog and templates; custom roles scoped to a single organization.
7. Add organization_id to each tenant-owned business table only after mapping existing rows and reviewing all FKs, triggers, RPC functions, storage policies, realtime subscriptions, and app queries.

## Security requirements
- RLS and server-side authorization must scope every business read/write to the authenticated user's organization membership.
- A role label in client state or user-editable metadata is never sufficient authorization.
- Super Admin is a platform-level entitlement, separate from company Owner and not assignable via ordinary company role management.
- Sensitive actions (role changes, exports, deletes, subscription changes) require audit logs.
- Face templates and attendance evidence require strict tenant isolation and retention controls.
- Test cross-tenant SELECT/INSERT/UPDATE/DELETE and RPC calls directly before launch.

## Safe implementation sequence
1. Complete read-only inventory of schema, policies, functions, triggers, storage policies, and frontend queries.
2. Verify existing business-owner mapping and create a backup/rollback plan.
3. Add additive schema in a reviewed migration; keep tenant columns nullable until backfill and app compatibility are ready.
4. Backfill the existing data to one verified initial organization; validate row counts and foreign-key relationships.
5. Update backend/RLS policies and RPC functions with organization checks.
6. Add company-scoped roles and custom permission management.
7. Add onboarding, subscription controls, and domain mapping.
8. Test with two isolated test organizations; do not use real customer data for adversarial tests.
9. Release only after build, security checks, backup, and rollback are verified.

## Not implemented
No production schema, application, subscription, custom-domain, or multi-tenant behavior has been changed by this plan file.
