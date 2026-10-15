# Live Supabase Migration History Reconciliation

Date: 2026-10-15  
Project: `xgagttyxpngkjfowaasf`  
Repository branch inspected: `saas-foundation`  
Status: read-only comparison; no migration was applied, repaired, renamed, or marked as reverted.

## Verified counts

- Supabase live migration history: **24 entries**.
- Repository `supabase/migrations` on `saas-foundation`: **22 SQL files**.
- Comparing exact numeric versions: **0 exact version matches**.
- Do not run `supabase db push`, `migration repair`, or replay any migration until the actual SQL bodies and live schema are compared.

The versions in the repository and live history appear to use different timestamp sequences. Similar names are not sufficient evidence that their SQL is equivalent.

## Live history (source: Supabase migration list)

| Version | Name |
|---|---|
| 20261010093843 | smart_business_management_initial_schema |
| 20261010093922 | add_missing_foreign_key_indexes |
| 20261014071519 | employee_face_verification_and_attendance_evidence_retention |
| 20261014071631 | attendance_evidence_seven_day_expiry_and_private_history |
| 20261014074022 | attendance_evidence_admin_upload |
| 20261014085309 | index_employee_face_templates_created_by |
| 20261014102327 | employee_product_orders_refunds_finance_reports |
| 20261014103150 | synchronize_business_transaction_lifecycle |
| 20261014103201 | atomic_inventory_product_and_stock_operations |
| 20261014103358 | atomic_order_submission_and_financial_posting |
| 20261014103451 | secure_refund_submission_and_order_item_validation |
| 20261014103517 | notify_business_workflow_and_finalize_refund_posting |
| 20261014103728 | audit_core_business_operations |
| 20261014104409 | enable_business_realtime_sync |
| 20261014105512 | fix_notifications_add_customer_membership_and_link_orders |
| 20261014111802 | order_payment_evidence_stock_reservation_and_refund_diagnostics |
| 20261014122633 | multi_item_order_auto_finance |
| 20261014133534 | add_hrd_role_constraint |
| 20261014133543 | add_hrd_access_helper |
| 20261014133555 | enable_hrd_people_operations |
| 20261014133608 | allow_hrd_face_template_management |
| 20261014142554 | fix_product_costs_admin_rls |
| 20261014143123 | allow_barcode_reuse_for_inactive_products |
| 20261014162559 | secure_refund_approval_rls |

## Repository SQL files (source: GitHub API listing of `saas-foundation`)

| Version | File |
|---|---|
| 20261014000000 | employee_face_verification_and_attendance_evidence_retention.sql |
| 20261014001000 | attendance_evidence_seven_day_expiry_and_private_history.sql |
| 20261014003000 | attendance_evidence_admin_upload.sql |
| 20261014010000 | role_based_privacy_rls.sql |
| 20261014020000 | configurable_attendance_sessions_and_daily_counts.sql |
| 20261014030000 | employee_product_orders_refunds_finance_reports.sql |
| 20261014040000 | synchronize_business_transaction_lifecycle.sql |
| 20261014041000 | atomic_inventory_product_and_stock_operations.sql |
| 20261014042000 | atomic_order_submission_and_financial_posting.sql |
| 20261014043000 | secure_refund_submission_and_order_item_validation.sql |
| 20261014044000 | notify_business_workflow_and_finalize_refund_posting.sql |
| 20261014045000 | audit_core_business_operations.sql |
| 20261014046000 | enable_business_realtime_sync.sql |
| 20261014110000 | fix_notifications_and_customer_membership.sql |
| 20261014122633 | multi_item_order_auto_finance.sql |
| 20261014130000 | order_payment_evidence_stock_reservation_and_refund_diagnostics.sql |
| 20261014130000 | set_product_stock_with_history.sql |
| 20261014131000 | reserve_stock_and_secure_refunds.sql |
| 20261014132000 | secure_order_payment_evidence_storage.sql |
| 20261014140000 | link_financial_reports_to_store.sql |
| 20261014150000 | audit_actor_identity.sql |
| 20261014180000 | add_hrd_role_access.sql |

## Concrete blockers

1. The repository contains **two files with the same version prefix `20261014130000`**. This is a migration ordering/version collision that must be resolved before the repository is used to apply migrations.
2. Live history contains versions absent from the repository's version list, including the initial schema and later HRD/product-cost/barcode/refund-approval changes.
3. Repository files with similar descriptions use different versions from live history. Renaming them to live versions without checking SQL bodies could cause duplicate DDL or data changes.
4. A GitHub CI build only validates application code; it does not prove the migration ledger matches the live database.

## Safe reconciliation procedure

1. Obtain the full database dump and test a restore in an isolated environment.
2. Export each repository migration SQL body and inventory live definitions for tables, columns, constraints, indexes, policies, functions, triggers, views, extensions, and publications.
3. Build a per-migration mapping with three possible decisions: `already represented in live schema`, `missing and safe to apply`, or `conflicting/needs manual rewrite`. Each decision must cite SQL diff evidence.
4. Resolve the duplicate repository version by assigning a new unique timestamp only after confirming its intended order and dependencies. Do not change the live ledger merely to make counts match.
5. Run the candidate migration sequence on the isolated restore; compare table counts, constraints, policies, function bodies, and key attendance/order/refund/finance workflows.
6. Commit the reconciled migration set on a non-production branch, run CI, review, and only then prepare a separate production release plan.

## Guardrail

This report is evidence and a plan, not a migration repair. Production database, `main`, Vercel deployment, and public domain remain unchanged.
