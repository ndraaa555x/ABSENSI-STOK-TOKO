# Frontend Data Access Inventory — SaaS Migration

Date: 2026-10-15
Source inspected: `app/page.tsx`, `app/attendance-camera/page.tsx` on branch `saas-foundation`.
This is a static inventory, not a code change. No production changes made.

## Main app (`app/page.tsx`)

Detected direct table/bucket references:
- `app_settings`
- `attendance_records`
- `business_customers`
- `employees`
- `financial_categories`
- `financial_reports`
- `financial_transactions`
- `leave_requests`
- `notifications`
- `product_categories`
- `product_costs`
- `product_order_items`
- `product_orders`
- `product_refunds`
- `products`
- `profiles`
- `stock_movements`
- Storage bucket references: `order-payment-evidence`

Detected RPC/function calls:
- `approve_financial_report`
- `approve_product_refund`
- `create_product_with_stock`
- `fulfill_product_order`
- `record_stock_movement`
- `set_product_stock`
- `submit_product_order_multi`
- `submit_product_refund`

## Attendance camera page (`app/attendance-camera/page.tsx`)

Detected direct table/bucket references:
- `app_settings`
- `attendance_records`
- `employee_face_templates`
- `employees`
- `profiles`
- Storage bucket reference: `attendance-evidence`

## Implications for SaaS

1. All listed business data calls need an organization scope after the tenant model exists; simply adding an organization selector in the UI is not security.
2. All RPCs listed above need explicit tenant authorization in the database function body and tenant-consistent checks on referenced orders, products, refunds, reports, and employees. RLS on tables alone does not guarantee safe function behavior.
3. `profiles` is currently used as a global role/account table. Do not change it into a single-organization profile if users may belong to multiple organizations; use a separate organization membership model.
4. `app_settings` currently behaves as global application configuration. Decide which settings are platform-wide versus organization-specific before migration.
5. Face templates and attendance evidence need tenant isolation, consent/retention protections, and a verified restore/deletion plan. Avoid copying biometric values into public reports or logs.
6. Financial reports, transactions, stock movements, order items and refund records have parent-child relationships. Tenant ownership must be consistent across parent and child rows, enforced with constraints/functions as appropriate.
7. The detected references are string-literal scans; dynamic queries, helper functions, SQL triggers and indirect dependencies may add accesses. Repeat a full repository scan and review source manually before implementation.

## Migration checklist

- [ ] Create a complete schema/function/policy/trigger inventory and map live migration history to repository SQL.
- [ ] Confirm recoverable full database + Storage backup with a test restore.
- [ ] Define organization membership, platform roles, tenant roles, and existing-data ownership.
- [ ] Draft and test tenant keys, foreign keys, unique constraints, RLS, function checks, and Storage path policies on an isolated restore.
- [ ] Add two-tenant automated tests for every detected table, RPC, bucket, and Edge Function.
- [ ] Run lint/build and regression tests for existing attendance, inventory, order, refund, and finance workflows.
- [ ] Obtain explicit production-change approval only after all gates pass.

## Release status

The frontend and database are **not yet tenant-isolated**. Do not onboard multiple customer businesses to the same live data until the tenant authorization and tests are implemented.
