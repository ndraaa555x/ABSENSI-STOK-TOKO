-- Restore core business workflows: employee product orders, refunds and finance submissions.
create table if not exists public.product_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  ordered_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','fulfilled','rejected','cancelled')),
  notes text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.product_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.product_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.product_refunds (
  id uuid primary key default gen_random_uuid(),
  refund_code text not null unique,
  order_id uuid not null references public.product_orders(id) on delete restrict,
  order_item_id uuid not null references public.product_order_items(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.financial_reports (
  id uuid primary key default gen_random_uuid(),
  report_code text not null unique,
  report_type text not null check (report_type in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  payment_method text check (payment_method in ('cash','bank_transfer','e_wallet','card','other')),
  reference_code text,
  related_order_id uuid references public.product_orders(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_orders_ordered_by_created_idx on public.product_orders (ordered_by, created_at desc);
create index if not exists product_orders_status_created_idx on public.product_orders (status, created_at desc);
create index if not exists product_order_items_order_idx on public.product_order_items (order_id);
create index if not exists product_refunds_requester_created_idx on public.product_refunds (requested_by, created_at desc);
create index if not exists product_refunds_status_created_idx on public.product_refunds (status, created_at desc);
create index if not exists financial_reports_submitter_created_idx on public.financial_reports (submitted_by, created_at desc);
create index if not exists financial_reports_status_created_idx on public.financial_reports (status, created_at desc);

alter table public.product_orders enable row level security;
alter table public.product_order_items enable row level security;
alter table public.product_refunds enable row level security;
alter table public.financial_reports enable row level security;

-- Employees may see active sale products to place orders; cost data stays protected separately.
drop policy if exists products_admin_owner_select on public.products;
create policy products_role_scoped_select on public.products for select to authenticated
using ((select private.is_admin_or_owner()) or ((select private.is_active_user()) and is_active = true));

drop policy if exists product_orders_select_own_or_management on public.product_orders;
create policy product_orders_select_own_or_management on public.product_orders for select to authenticated
using (ordered_by = (select auth.uid()) or (select private.is_admin_or_owner()));
drop policy if exists product_orders_insert_active_user on public.product_orders;
create policy product_orders_insert_active_user on public.product_orders for insert to authenticated
with check (ordered_by = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists product_orders_update_management on public.product_orders;
create policy product_orders_update_management on public.product_orders for update to authenticated
using ((select private.is_admin_or_owner())) with check ((select private.is_admin_or_owner()));

drop policy if exists product_order_items_select_scoped on public.product_order_items;
create policy product_order_items_select_scoped on public.product_order_items for select to authenticated
using (exists (select 1 from public.product_orders o where o.id = order_id and (o.ordered_by = (select auth.uid()) or (select private.is_admin_or_owner()))));
drop policy if exists product_order_items_insert_scoped on public.product_order_items;
create policy product_order_items_insert_scoped on public.product_order_items for insert to authenticated
with check (exists (select 1 from public.product_orders o where o.id = order_id and ((o.ordered_by = (select auth.uid()) and o.status = 'pending') or (select private.is_admin_or_owner()))));

drop policy if exists product_refunds_select_scoped on public.product_refunds;
create policy product_refunds_select_scoped on public.product_refunds for select to authenticated
using (requested_by = (select auth.uid()) or (select private.is_admin_or_owner()));
drop policy if exists product_refunds_insert_own_order on public.product_refunds;
create policy product_refunds_insert_own_order on public.product_refunds for insert to authenticated
with check (requested_by = (select auth.uid()) and (select private.is_active_user())
  and exists (select 1 from public.product_orders o where o.id = order_id and o.ordered_by = (select auth.uid()) and o.status in ('approved','fulfilled'))
  and exists (select 1 from public.product_order_items i where i.id = order_item_id and i.order_id = product_refunds.order_id));
drop policy if exists product_refunds_update_management on public.product_refunds;
create policy product_refunds_update_management on public.product_refunds for update to authenticated
using ((select private.is_admin_or_owner())) with check ((select private.is_admin_or_owner()));

drop policy if exists financial_reports_select_scoped on public.financial_reports;
create policy financial_reports_select_scoped on public.financial_reports for select to authenticated
using (submitted_by = (select auth.uid()) or (select private.is_admin_or_owner()));
drop policy if exists financial_reports_insert_own on public.financial_reports;
create policy financial_reports_insert_own on public.financial_reports for insert to authenticated
with check (submitted_by = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists financial_reports_update_management on public.financial_reports;
create policy financial_reports_update_management on public.financial_reports for update to authenticated
using ((select private.is_admin_or_owner())) with check ((select private.is_admin_or_owner()));
drop policy if exists financial_reports_delete_owner on public.financial_reports;
create policy financial_reports_delete_owner on public.financial_reports for delete to authenticated
using ((select private.is_owner()));

grant select, insert, update on public.product_orders to authenticated;
grant select, insert on public.product_order_items to authenticated;
grant select, insert, update on public.product_refunds to authenticated;
grant select, insert, update, delete on public.financial_reports to authenticated;
