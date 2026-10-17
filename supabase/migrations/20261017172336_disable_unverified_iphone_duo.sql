-- Do not offer the unverified "iPhone Duo" placeholder for sale.
-- Keep the product row and stock history for auditability; this is reversible.
update public.products
set is_active = false
where sku = 'IPH-DUO-256'
  and name = 'Apple iPhone Duo 256GB';