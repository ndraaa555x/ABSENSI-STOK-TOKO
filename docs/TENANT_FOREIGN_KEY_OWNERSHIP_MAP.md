# Tenant Foreign-Key and Ownership Map

Date: 2026-10-15
Source: read-only PostgreSQL catalog query against the existing Supabase project.
No schema changes were made.

## Existing foreign-key edges

- `attendance_records.employee_id → employees.id`
- `attendance_records.recorded_by → profiles.id`
- `employees.created_by → profiles.id`
- `employees.profile_id → profiles.id`
- `leave_requests.employee_id → employees.id`
- `leave_requests.reviewed_by → profiles.id`
- `employee_face_templates.employee_id → employees.id`
- `employee_face_templates.created_by → profiles.id`
- `products.category_id → product_categories.id`
- `products.created_by → profiles.id`
- `product_costs.product_id → products.id`
- `product_costs.updated_by → profiles.id`
- `stock_movements.product_id → products.id`
- `stock_movements.created_by → profiles.id`
- `financial_transactions.category_id → financial_categories.id`
- `financial_transactions.created_by → profiles.id`
- `product_orders.ordered_by → profiles.id`
- `product_orders.reviewed_by → profiles.id`
- `product_orders.customer_id → business_customers.id`
- `product_order_items.order_id → product_orders.id`
- `product_order_items.product_id → products.id`
- `product_refunds.order_id → product_orders.id`
- `product_refunds.order_item_id → product_order_items.id`
- `product_refunds.requested_by → profiles.id`
- `product_refunds.reviewed_by → profiles.id`
- `product_refunds.posted_transaction_id → financial_transactions.id`
- `financial_reports.related_order_id → product_orders.id`
- `financial_reports.related_customer_id → business_customers.id`
- `financial_reports.posted_transaction_id → financial_transactions.id`
- `financial_reports.submitted_by → profiles.id`
- `financial_reports.reviewed_by → profiles.id`
- `business_customers.created_by → profiles.id`
- `notifications.user_id → profiles.id`
- `audit_logs.actor_id → profiles.id`
- `app_settings.updated_by → profiles.id`

## Tenant design implications

1. Keep `profiles` as global identity. A profile can have a separate membership per organization; do not use one global role to represent all tenant roles.
2. Organization-owned tables need an explicit organization key and policies that derive allowed organizations from a trusted membership record.
3. For child records (`product_order_items`, `product_refunds`, `product_costs`, `stock_movements`, `employee_face_templates`), enforce that the parent and child organization IDs match. A tenant_id column alone is not enough if cross-tenant foreign-key references remain possible.
4. Existing foreign keys that point to global `profiles` identify actors, not tenant ownership. Keep actor identity references but authorize each action against organization membership.
5. Candidate organization-scoped uniqueness rules must be reviewed: product SKU/barcode, customer code, employee code, order code, refund code, transaction code, report code, category names and app settings.
6. `app_settings` needs a split between platform-wide settings and organization-specific settings before tenant backfill.
7. `audit_logs` should be tenant scoped where the action is tenant-owned, while platform audit events may remain global with strict platform access.
8. `notifications` must bind both recipient and underlying event to the same organization to prevent cross-tenant notifications.
9. `employee_face_templates` and Storage evidence require additional privacy/retention controls; never export biometric payloads as part of this mapping.

## Backfill prerequisite

Do not populate every row with `NDRAAAID` until the business owner confirms that all current data belongs to that organization. The pilot organization's intended name alone is not proof of ownership of every existing row.

## Validation requirements

- Check orphaned rows before adding any constraints.
- Add composite tenant-aware foreign keys only after parent/child tenant values are backfilled and duplicates/orphans are resolved.
- Test both allowed same-tenant references and denied cross-tenant references on a restored, isolated database.
- Keep this map as planning documentation; it is not executable migration SQL.
