# Edge Function Review for SaaS

Date: 2026-10-15
Status: static source review only; no function deployed or changed.

## 1. manage-employee-accounts

Current observed behavior:
- Function has JWT verification enabled in Supabase.
- Reads `SUPABASE_SERVICE_ROLE_KEY` only server-side and calls `auth.getUser(token)` to validate the bearer token.
- Checks that the actor has an active `profiles` record.
- Checks roles per action for account list/create/delete/update and logs actions.
- Account create links a newly created auth account to an employee record; delete paths unlink before deleting auth account.

SaaS blocker:
- Actor authorization is based on global `profiles.role` and `profiles.is_active`, not an organization membership.
- Several lookups/updates use global employee/profile IDs without an organization predicate because the current schema has no tenant key.
- Therefore this function must not be treated as SaaS-safe until every action is reworked to resolve an organization from a verified membership, check actor permission in that organization, and verify every target employee/profile belongs to the same organization.
- Global account administration must be split from tenant-level staff administration. Tenant admins must not be able to grant platform-owner privileges or manage accounts from another tenant.
- Review audit log writes and failure handling as part of the redesign; audit records should include the verified organization ID without exposing secrets.

## 2. purge-attendance-evidence

Current observed behavior:
- Supabase reports JWT verification enabled.
- Function additionally compares the Authorization bearer token with the service-role key, then uses that privileged client to query up to 500 expired attendance evidence records, remove files from `attendance-evidence`, and clear paths from records.
- It does not accept an arbitrary object path from the request body; it queries eligible records from the database.

SaaS blocker:
- The job is global, with no organization-specific batch boundary. That can be acceptable for a trusted platform maintenance job only if its scope is intentionally global and its invocation is restricted to a trusted scheduler. For tenant-aware operation, ensure object paths and record ownership remain consistent and record the organization context.
- A service-role key is a high-privilege secret. Keep it only in server-side secrets; never place it in browser code, public environment variables, logs, or repository files.
- Confirm the scheduled caller actually uses a secure secret store and that only the intended workflow can invoke the function. Do not loosen JWT verification as a workaround.
- Confirm partial-failure behavior: storage deletion can succeed while the subsequent database update fails, leaving a stale evidence path. Add reconciliation/observability in a future tested change.

## 3. Required test cases before SaaS release

- Tenant A user cannot list, create, modify, disable, or delete Tenant B accounts or employee links.
- Tenant admin cannot create or promote an account to platform-owner role.
- Employee cannot call any account-management action.
- Inactive actor and invalid/expired token are denied.
- Scheduled evidence cleanup only deletes eligible expired files and does not touch unexpired evidence.
- Cleanup is not publicly invocable without the trusted scheduler credential.
- Every action failure returns a safe message and leaves account/profile/employee links in a consistent state.
- Audit records identify the verified tenant and action without storing passwords, access tokens, or service-role keys.

## Decision

Do not deploy a SaaS tenant-aware version of either function until the tenant schema, membership authorization, per-tenant object paths, and tests exist. This review records risks; it does not change production.
