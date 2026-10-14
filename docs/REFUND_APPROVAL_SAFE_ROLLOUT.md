# Refund approval: safe rollout checklist

## Current state
- Existing Supabase project: `xgagttyxpngkjfowaasf` (production; do not recreate).
- Migration is present only on branch `fix/refund-approval-feedback`.
- The production migration history does not include `20261014190000`.
- The pending refund remains pending; no transaction or stock movement was created during this audit.
- CI validation for the latest migration commit passed.

## Why the proposed fix changed
The existing function is SECURITY INVOKER. The RLS policy on `product_order_items` grants SELECT for the order owner or active management, but has no UPDATE policy. The old function used `SELECT ... FOR UPDATE` on that table. The revised function does not lock the item row; instead, it locks the parent order before checking existing approved refunds, which serializes approvals belonging to the same order while preserving caller RLS.

## Preconditions before production
1. Export a recoverable copy of the relevant schema and business data using Supabase Dashboard or a trusted database export path. A code migration file is not a data backup.
2. Save the current definitions of `public.approve_product_refund(uuid)` and all grants/policies relevant to refund, orders, order items, products, stock movements, and financial transactions.
3. Confirm an authorized Owner/Admin account can be used for a controlled verification.
4. Confirm the pending refund code is not already present in `financial_transactions`. The read-only check on 2026-10-14 returned no matching transaction code or reference code.
5. Review this migration and run database security advisors after applying it.

## Safe verification sequence
1. Apply the migration only after recovery readiness is confirmed.
2. Read back the function definition and confirm SECURITY INVOKER, fixed empty search_path, explicit Owner/Admin check, and grants restricted to authenticated.
3. Verify the pending refund remains pending and that no matching financial transaction or stock movement was created by the migration itself.
4. Do not approve the real pending refund as a test. Use a dedicated disposable test order/refund only if one can be created and cleaned up safely without touching real inventory or financial records.
5. If any verification fails, stop and restore the saved function definition/grants. Do not retry approval blindly.

## Known separate security findings
Supabase security advisors also reported other SECURITY DEFINER RPCs callable by anon/authenticated, including `post_order_finance_on_approval`, `set_product_stock`, order submission RPCs, and refund submission RPC. These were not changed as part of this refund fix because changing them without reviewing their callers could break checkout, stock, or refund workflows. They should receive a separate least-privilege review.
