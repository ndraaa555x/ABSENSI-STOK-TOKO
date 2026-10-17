-- Seed the HANDPHONE catalog with conservative starter quantities.
-- Prices and quantities are estimates requested by the owner; verify actual devices,
-- IMEI, condition, warranty, supplier invoice, and payment before real sales.
-- Idempotent by SKU and reference code: existing products/stock are not incremented again.

WITH category AS (
  INSERT INTO public.product_categories (name, description)
  VALUES ('HANDPHONE', 'Smartphone dan perangkat telepon genggam.')
  ON CONFLICT (name) DO UPDATE
    SET description = COALESCE(public.product_categories.description, EXCLUDED.description)
  RETURNING id
),
seed(sku, name, cost_price, sale_price, stock, description) AS (
  VALUES
    ('IPH-11-128', 'Apple iPhone 11 128GB (Bekas Grade A)', 3500000, 4100000, 2, 'Estimasi harga unit bekas Grade A; kondisi, baterai, IMEI dan kelengkapan wajib diperiksa.'),
    ('IPH-12-128', 'Apple iPhone 12 128GB (Bekas Grade A)', 4300000, 4900000, 2, 'Estimasi harga unit bekas Grade A; kondisi, baterai, IMEI dan kelengkapan wajib diperiksa.'),
    ('IPH-13-128', 'Apple iPhone 13 128GB', 5300000, 6100000, 2, 'Harga modal dan jual estimasi; status baru/bekas serta garansi harus diverifikasi saat penerimaan.'),
    ('IPH-14-128', 'Apple iPhone 14 128GB', 6200000, 7100000, 2, 'Harga modal dan jual estimasi; status baru/bekas serta garansi harus diverifikasi saat penerimaan.'),
    ('IPH-15-128', 'Apple iPhone 15 128GB', 8500000, 9400000, 2, 'Estimasi harga pasar Indonesia; harga distributor dan ketersediaan dapat berubah.'),
    ('IPH-16-128', 'Apple iPhone 16 128GB', 10200000, 11200000, 2, 'Estimasi harga pasar Indonesia; harga distributor dan ketersediaan dapat berubah.'),
    ('IPH-17-256', 'Apple iPhone 17 256GB', 13000000, 14200000, 2, 'Estimasi harga pasar Indonesia; harga distributor dan ketersediaan dapat berubah.'),
    ('IPH-17E-256', 'Apple iPhone 17e 256GB', 11500000, 12500000, 2, 'Estimasi harga pasar Indonesia; harga distributor dan ketersediaan dapat berubah.'),
    ('IPH-AIR-256', 'Apple iPhone Air 256GB', 15500000, 16800000, 2, 'Estimasi harga pasar Indonesia; harga distributor dan ketersediaan dapat berubah.'),
    ('IPH-18PRO-256', 'Apple iPhone 18 Pro 256GB', 18500000, 20500000, 2, 'Harga modal/jual provisional; konfirmasi ketersediaan resmi Indonesia, varian dan garansi sebelum transaksi.'),
    ('IPH-18PM-256', 'Apple iPhone 18 Pro Max 256GB', 21500000, 23500000, 2, 'Harga modal/jual provisional; konfirmasi ketersediaan resmi Indonesia, varian dan garansi sebelum transaksi.'),
    ('IPH-DUO-256', 'Apple iPhone Duo 256GB', 25000000, 27500000, 2, 'Harga modal/jual provisional untuk lini foldable; konfirmasi harga resmi, ketersediaan dan spesifikasi sebelum transaksi.')
),
new_products AS (
  INSERT INTO public.products
    (sku, barcode_value, name, category_id, unit, description, sale_price, current_stock, minimum_stock, storage_location, is_active, created_by)
  SELECT s.sku, s.sku, s.name, c.id, 'unit',
         s.description || ' Harga dan stok awal merupakan estimasi; cocokkan dengan barang fisik. SKU bukan barcode fisik terverifikasi.',
         s.sale_price, s.stock, 1, 'Gudang Kantor Pusat', true,
         'd4d16695-edd9-42ed-81ac-676eed6c0c03'::uuid
  FROM seed s CROSS JOIN category c
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.sku = s.sku)
  RETURNING id, sku
),
product_rows AS (
  SELECT id, sku FROM new_products
  UNION ALL
  SELECT p.id, p.sku
  FROM public.products p
  JOIN seed s ON s.sku = p.sku
  WHERE NOT EXISTS (SELECT 1 FROM new_products n WHERE n.sku = p.sku)
),
costs AS (
  INSERT INTO public.product_costs (product_id, cost_price, updated_by)
  SELECT p.id, s.cost_price, 'd4d16695-edd9-42ed-81ac-676eed6c0c03'::uuid
  FROM product_rows p
  JOIN seed s ON s.sku = p.sku
  ON CONFLICT (product_id) DO UPDATE
    SET cost_price = EXCLUDED.cost_price,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
  RETURNING product_id
),
movements AS (
  INSERT INTO public.stock_movements
    (product_id, movement_type, quantity, unit_cost, reference_code, reason, notes, created_by)
  SELECT p.id, 'purchase_in', s.stock, s.cost_price, 'INV-KP-20261017-03',
         'Pencatatan stok awal kategori HANDPHONE',
         'Stok dan modal estimasi; verifikasi barang fisik/IMEI, kondisi, kapasitas, garansi dan bukti pembelian.',
         'd4d16695-edd9-42ed-81ac-676eed6c0c03'::uuid
  FROM new_products p
  JOIN seed s ON s.sku = p.sku
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stock_movements m
    WHERE m.product_id = p.id AND m.reference_code = 'INV-KP-20261017-03'
  )
  RETURNING id
),
expense AS (
  INSERT INTO public.financial_transactions
    (transaction_code, transaction_type, amount, payment_method, description, reference_code, evidence_path, status, created_by)
  SELECT 'EXP-KP-20261017-03', 'expense', SUM(s.cost_price * s.stock), NULL,
         'Estimasi nilai modal stok awal kategori HANDPHONE; faktur dan pembayaran belum diverifikasi.',
         'INV-KP-20261017-03', NULL, 'posted',
         'd4d16695-edd9-42ed-81ac-676eed6c0c03'::uuid
  FROM seed s
  WHERE EXISTS (SELECT 1 FROM new_products)
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_transactions f
      WHERE f.reference_code = 'INV-KP-20261017-03'
    )
  HAVING COUNT(*) > 0
  RETURNING id
)
SELECT
  (SELECT COUNT(*) FROM new_products) AS products_inserted,
  (SELECT COUNT(*) FROM costs) AS cost_records_upserted,
  (SELECT COUNT(*) FROM movements) AS movements_inserted,
  (SELECT COUNT(*) FROM expense) AS expense_records_inserted;
