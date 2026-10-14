# Production Migration Reconciliation — SaaS Readiness

Date: 2026-10-15
Environment checked: live Supabase project metadata and GitHub branch `saas-foundation`.
No migrations were applied to production during this check.

## Result

- Live Supabase migration history: **24 entries**.
- SQL files in repository `supabase/migrations` on `saas-foundation`: **22 files**.
- They are not an exact timestamp/name match. Therefore, the repository folder cannot safely be treated as a replay-ready representation of the current production schema.

## Production entries with no direct filename/version match in this branch

- `20261010093843 smart_business_management_initial_schema`
- `20261010093922 add_missing_foreign_key_indexes`
- `20261014085309 index_employee_face_templates_created_by`
- `20261014133534 add_hrd_role_constraint`
- `20261014133543 add_hrd_access_helper`
- `20261014133555 enable_hrd_people_operations`
- `20261014133608 allow_hrd_face_template_management`
- `20261014142554 fix_product_costs_admin_rls`
- `20261014143123 allow_barcode_reuse_for_inactive_products`
- `20261014162559 secure_refund_approval_rls`

The list above means there is no exact filename/version match; it does **not** by itself prove the SQL content is absent. Some changes may be bundled in differently named repository files or exist only on another branch. Compare actual SQL definitions and commit history before deciding what is missing.

## Similar names with different timestamps

Production and repository filenames include similar migration names for attendance evidence, orders/refunds, stock operations, and notifications, but timestamps differ. For example, live production uses versions `20261014071519`, `20261014102327`, and `20261014103150`, while branch filenames use `20261014000000`, `20261014030000`, and `20261014040000` respectively. Never rename files to match history without verifying SQL content and dependency order.

## Safe action

1. Keep a read-only copy of the live migration history.
2. Retrieve the SQL content from every relevant branch and compare definitions against the live catalog (functions, tables, constraints, indexes, policies, triggers).
3. Build a reconciled migration ledger showing: live version, repository file/commit, SQL-content match, dependencies, and status.
4. Use an isolated restored database to test the proposed sequence.
5. Do not replay existing migrations or run SaaS tenant DDL in production until the ledger and restore test are complete.

## Decision

Production remains unchanged. This is a deployment/recovery blocker independent of Vercel availability.