# SaaS Tenant Ownership Matrix (Read-only production audit)

Date: 2026-10-15
Status: planning artifact only. No production schema, policy, application behavior, or deployment changed.

## Result

All 19 current public tables lack `organization_id`, `tenant_id`, or `workspace_id`. Existing RLS policies mostly use global `profiles.role` helpers or creator/submitter ownership. Those rules are not sufficient to isolate multiple customer organizations.

## Proposed ownership by table

| Table | Proposed owner/scope | Key dependency and special handling |
|---|---|---|
| `profiles` | Global identity; tenant access via membership table | Do not put a single tenant role on the global identity |
| `employees` | Organization | `profile_id` remains global auth identity link; employee code uniqueness becomes per organization |
| `attendance_records` | Organization, consistent with employee | Must validate attendance employee belongs to same organization; evidence retention applies |
| `leave_requests` | Organization, consistent with employee | Employee and reviewer permissions must be tenant scoped |
| `employee_face_templates` | Organization, consistent with employee | Biometric embedding is sensitive; preserve consent, retention, least privilege |
| `products` | Organization | SKU/barcode uniqueness should be evaluated per organization; no cross-tenant product references |
| `product_categories` | Organization | Category names/uniqueness per organization |
| `product_costs` | Organization, consistent with product | Enforce product ownership match |
| `stock_movements` | Organization, consistent with product | Enforce product ownership match and preserve immutable history |
| `product_orders` | Organization | Customer and actor must belong to or be authorized in same organization |
| `product_order_items` | Organization, consistent with order and product | Must reject an item whose product is from another organization |
| `product_refunds` | Organization, consistent with order and order item | Order, order item, reviewer and finance posting must be same tenant |
| `business_customers` | Organization | Customer code uniqueness per organization |
| `financial_categories` | Organization | Category names scoped to organization |
| `financial_transactions` | Organization | Category, actor, order/refund reference and report posting must match tenant |
| `financial_reports` | Organization | Order/customer/transaction references must match tenant |
| `app_settings` | Split global platform settings vs organization settings | Existing `setting_key` needs a defined scope and uniqueness model before backfill |
| `notifications` | Organization for tenant events; global only for platform events | Recipient and referenced event must belong to same organization |
| `audit_logs` | Organization for tenant events; platform audit events separate | Actor identity alone does not establish organization ownership |

## Existing authorization patterns that must be replaced or extended

The production policy catalog includes examples of:
- global `private.is_admin_or_owner()`, `private.is_owner()`, and `private.is_hrd_or_admin_or_owner()` checks;
- `created_by = auth.uid()` / `submitted_by = auth.uid()` ownership;
- employee self-access through `employees.profile_id = auth.uid()`.

For SaaS, these predicates must also require membership in the specific row's organization and a role within that organization. A platform-level operator role must be distinct from tenant Owner/Admin/HRD roles.

## Safe implementation sequence

1. Create organization and organization-membership model in an isolated test environment.
2. Determine and verify ownership of every existing row; do not infer that every row belongs to `NDRAAAID` solely from the planned pilot organization name.
3. Add nullable organization keys, backfill verified ownership, then verify no nulls, duplicate scoped identifiers, orphan rows, or cross-organization references.
4. Add tenant-aware composite foreign keys where needed; use parent+organization keys for child tables.
5. Implement and test membership helper functions and RLS policies, including UPDATE `USING` and `WITH CHECK`.
6. Scope every RPC/SECURITY DEFINER function and Edge Function to the authenticated actor's tenant; test direct RPC access, not only UI access.
7. Scope private Storage bucket policies and object paths to organization; verify access to both attendance and order-payment evidence.
8. Run cross-tenant negative tests for all tables, RPCs, Storage, realtime subscriptions, notifications, and employee face verification.
9. Restore-test a complete backup before production rollout; deploy in a maintenance/rollback plan only after all checks pass.

## Minimum acceptance tests

- User from organization A cannot SELECT, INSERT, UPDATE, or DELETE organization B rows through the API.
- A tenant admin cannot assign themselves a different tenant or elevate a global role by changing row fields.
- Order A cannot contain a product from B; refund/order/transaction/report links cannot cross tenants.
- Employee A cannot check in/out or read face templates for employee B in another tenant.
- A signed-in user cannot read or replace another tenant's Storage objects by guessing object paths.
- Platform-wide support access is explicitly logged and separate from tenant roles.
- Existing single-organization behavior remains intact after restore-test and regression checks.

## Explicitly not done

- No migration applied to production.
- No tenant key backfilled.
- No RLS policy or role changed.
- No project/domain created.
- No deployment or merge performed.
