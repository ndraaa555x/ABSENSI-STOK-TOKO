# Order RPC Findings and Required Regression Tests

Date: 2026-10-15  
Function inspected: `public.submit_product_order_multi(jsonb,text,uuid,text,text)`  
Environment: live Supabase catalog, read-only inspection only.

## Confirmed code-level risks

1. **Customer ownership check is weaker in the multi-item RPC.** The single-item `submit_product_order` verifies that a selected customer is active and either created by the current user or the actor is an Admin/Owner. The multi-item function checked only that the customer ID exists and is active. Because the function is `SECURITY DEFINER`, this ownership condition must be checked explicitly in the function.
2. **Duplicate product IDs can bypass the stock pre-check.** The function loops through submitted lines and compares each line quantity independently against current stock, then loops again to subtract each quantity. If the same product appears multiple times, each line can pass while the sum exceeds stock. The stock validation should aggregate quantities by product ID and lock products in deterministic order before reserving stock.
3. The function is `SECURITY DEFINER` with an explicit search path. Do not change EXECUTE grants as part of the same fix; review grants separately after confirming all callers and triggers.

These findings are from source inspection only. No exploit was run and no production data was changed.

## Required isolated tests before a candidate fix is approved

- A valid active employee submits one product with sufficient stock; one order line and one matching stock movement are created.
- A multi-product order reserves the expected total stock and creates consistent line totals.
- Duplicate entries for one product are combined or rejected; their combined quantity cannot exceed stock.
- If any line is invalid or any product lacks stock, the entire transaction rolls back: no order, order items, stock changes, or stock movements remain.
- A user cannot submit an order against a customer created by another employee unless the caller is an authorized Admin/Owner.
- Inactive/missing customer IDs are rejected.
- Empty arrays, non-array JSON, missing product IDs, malformed UUIDs, null/zero/negative quantities, and more than 50 lines are rejected safely.
- Concurrent requests cannot reserve more than available stock.
- Approval/rejection/refund and financial posting still work; rejected orders restore exactly the reserved quantities once, and repeated transitions do not double-post.
- Test all authorization cases with at least two ordinary users and one Admin/Owner account.

## Next implementation gate

Prepare a reviewed candidate SQL rewrite in a non-production workspace after the full database dump and isolated restore are available. Compare the live function body before replacing it, then run all tests above. Do not apply an untested rewrite to production.
