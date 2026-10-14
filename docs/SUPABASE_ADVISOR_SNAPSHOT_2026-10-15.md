# Supabase Advisor snapshot — 2026-10-15

Read-only check of Supabase Security and Performance Advisors for project `xgagttyxpngkjfowaasf`. No changes were applied.

## Security findings

- 1 warning: `public.post_order_finance_on_approval()` is SECURITY DEFINER and Advisor reports EXECUTE available to `anon`, with a REST RPC route. It is intended as a trigger function, so verify the API behavior and trigger dependency, then remove direct EXECUTE grants if not required. Do not change its security mode blindly.
- 5 warnings for SECURITY DEFINER functions executable by authenticated users: `post_order_finance_on_approval()`, `set_product_stock(...)`, `submit_product_order(...)`, `submit_product_order_multi(...)`, and `submit_product_refund(...)`. The four business RPCs may be intentional; each must retain explicit identity, active-account, role/ownership, and input checks.
- 1 warning: Supabase Auth leaked-password protection is disabled. Enable in Auth settings after verifying available configuration and expected user impact.

## Performance findings

- 22 indexes flagged as unused. Do not drop solely from this snapshot; traffic is low and usage counters can reset.
- 18 cases of multiple permissive RLS policies. Review for equivalent authorization logic before consolidation; policy overlap can be intentional.
- 1 duplicate index warning: `stock_movements_product_at_idx` and `stock_movements_product_date_idx`. Confirm definitions, constraints, and query plans before considering removal.

## Decision

These are review items, not automatic changes. No grants, functions, policies, indexes, Auth settings, or production data were modified. Security and data isolation take priority over cosmetic advisor-warning reduction.
