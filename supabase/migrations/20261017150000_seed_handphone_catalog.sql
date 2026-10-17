-- Idempotent inventory seed for PR #38.
-- Includes all added central-office categories/products discussed with the owner:
-- 5 PC categories (10 SKUs) and HANDPHONE (12 SKUs). Existing rows are not restocked twice.
-- Prices and starter quantities are estimates; verify physical stock, invoices, model/specs,
-- device IMEI/condition/warranty, and payment before treating them as verified purchases.
WITH category_seed(name, description) AS (
 VALUES
 ('MONITOR & DISPLAY','Monitor komputer dan perangkat display.'),
 ('CASING KOMPUTER','Casing dan rangka komputer desktop.'),
 ('KARTU GRAFIS (VGA)','Kartu grafis untuk komputer desktop.'),
 ('UPS & PROTEKSI DAYA','UPS dan perlindungan daya perangkat komputer.'),
 ('PROSESOR','Prosesor komputer desktop.'),
 ('MOTHERBOARD','Papan induk komputer desktop.'),
 ('RAM & PENYIMPANAN','Memori RAM dan perangkat penyimpanan.'),
 ('PERIFERAL KOMPUTER','Periferal dan aksesori komputer.'),
 ('JARINGAN & AKSESORIS','Perangkat jaringan dan aksesori.'),
 ('POWER SUPPLY & PENDINGIN','Catu daya dan pendingin komputer.'),
 ('PART KOMPUTER','Komponen dan suku cadang komputer.'),
 ('KABEL & KONVERTER','Kabel dan konverter konektivitas komputer.'),
 ('HANDPHONE','Smartphone dan perangkat telepon genggam.')
),
categories AS (
 INSERT INTO public.product_categories(name,description)
 SELECT name,description FROM category_seed
 ON CONFLICT(name) DO UPDATE SET description=COALESCE(public.product_categories.description,EXCLUDED.description)
 RETURNING id,name
),
seed(sku,name,category_name,cost_price,sale_price,stock,unit,reference_code,description) AS (
 VALUES
 ('CPU-I514400F','Intel Core i5-14400F','PROSESOR',3000000,3350000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi spesifikasi dan faktur.'),
 ('CPU-R55600','AMD Ryzen 5 5600','PROSESOR',1550000,1750000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi spesifikasi dan faktur.'),
 ('MB-B760M-D5','Motherboard B760M DDR5','MOTHERBOARD',2300000,2650000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi socket, chipset dan faktur.'),
 ('MB-A520M','Motherboard A520M AM4','MOTHERBOARD',850000,1050000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi socket, chipset dan faktur.'),
 ('RAM-D4-16','RAM DDR4 16GB','RAM & PENYIMPANAN',400000,500000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi merek, kecepatan dan faktur.'),
 ('RAM-D5-16','RAM DDR5 16GB','RAM & PENYIMPANAN',650000,780000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi merek, kecepatan dan faktur.'),
 ('SSD-NVME-1T','SSD NVMe 1TB','RAM & PENYIMPANAN',1150000,1350000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi merek, interface dan faktur.'),
 ('SSD-NVME-500','SSD NVMe 500GB','RAM & PENYIMPANAN',600000,720000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi merek, interface dan faktur.'),
 ('PER-KM-USB','Paket keyboard + mouse USB','PERIFERAL KOMPUTER',150000,220000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi merek dan isi paket.'),
 ('NET-ROUTER-G','Router Gigabit dual-band','JARINGAN & AKSESORIS',350000,450000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi merek dan spesifikasi.'),
 ('NET-SW8-G','Switch Gigabit 8-port','JARINGAN & AKSESORIS',250000,330000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi merek dan spesifikasi.'),
 ('PSU-650-BR','PSU 650W 80+ Bronze','POWER SUPPLY & PENDINGIN',700000,850000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi merek, sertifikasi dan garansi.'),
 ('COOL-CPU-TWR','CPU cooler tower entry-level','POWER SUPPLY & PENDINGIN',250000,350000,300,'pcs','INV-KP-20261017-01','Harga modal dan jual estimasi; verifikasi socket dan kelengkapan.'),
 ('MON-FHD-24','Monitor 24 inci Full HD','MONITOR & DISPLAY',1200000,1450000,50,'pcs','INV-KP-20261017-02','Monitor 24 inci Full HD; merek dan spesifikasi harus dicocokkan dengan barang fisik.'),
 ('MON-FHD-27','Monitor 27 inci Full HD','MONITOR & DISPLAY',1750000,2100000,50,'pcs','INV-KP-20261017-02','Monitor 27 inci Full HD; merek dan spesifikasi harus dicocokkan dengan barang fisik.'),
 ('CASE-MATX-AF','Casing mATX Airflow','CASING KOMPUTER',350000,450000,50,'pcs','INV-KP-20261017-02','Casing mATX airflow; estimasi spesifikasi.'),
 ('CASE-ATX-TG','Casing ATX Tempered Glass','CASING KOMPUTER',650000,820000,50,'pcs','INV-KP-20261017-02','Casing ATX tempered glass; estimasi spesifikasi.'),
 ('VGA-RTX4060-8','GeForce RTX 4060 8GB','KARTU GRAFIS (VGA)',4500000,5050000,50,'pcs','INV-KP-20261017-02','Kartu grafis RTX 4060 8GB; merek/AIB dan garansi harus diverifikasi.'),
 ('VGA-RX7600-8','Radeon RX 7600 8GB','KARTU GRAFIS (VGA)',3800000,4300000,50,'pcs','INV-KP-20261017-02','Kartu grafis Radeon RX 7600 8GB; merek/AIB dan garansi harus diverifikasi.'),
 ('UPS-650VA','UPS 650VA','UPS & PROTEKSI DAYA',650000,820000,50,'pcs','INV-KP-20261017-02','UPS 650VA; merek dan spesifikasi baterai harus diverifikasi.'),
 ('UPS-1200VA','UPS 1200VA','UPS & PROTEKSI DAYA',1250000,1550000,50,'pcs','INV-KP-20261017-02','UPS 1200VA; merek dan spesifikasi baterai harus diverifikasi.'),
 ('CAB-HDMI21','Kabel HDMI 2.1','KABEL & KONVERTER',45000,75000,50,'pcs','INV-KP-20261017-02','Kabel HDMI 2.1; panjang dan sertifikasi harus diverifikasi.'),
 ('CON-USBCHUB','USB-C Hub Multiport','KABEL & KONVERTER',180000,280000,50,'pcs','INV-KP-20261017-02','USB-C hub multiport; konfigurasi port harus diverifikasi.'),
 ('IPH-11-128','Apple iPhone 11 128GB (Bekas Grade A)','HANDPHONE',3500000,4100000,2,'unit','INV-KP-20261017-03','Estimasi harga unit bekas Grade A; kondisi, baterai, IMEI dan kelengkapan wajib diperiksa.'),
 ('IPH-12-128','Apple iPhone 12 128GB (Bekas Grade A)','HANDPHONE',4300000,4900000,2,'unit','INV-KP-20261017-03','Estimasi harga unit bekas Grade A; kondisi, baterai, IMEI dan kelengkapan wajib diperiksa.'),
 ('IPH-13-128','Apple iPhone 13 128GB','HANDPHONE',5300000,6100000,2,'unit','INV-KP-20261017-03','Harga modal dan jual estimasi; status baru/bekas serta garansi harus diverifikasi.'),
 ('IPH-14-128','Apple iPhone 14 128GB','HANDPHONE',6200000,7100000,2,'unit','INV-KP-20261017-03','Harga modal dan jual estimasi; status baru/bekas serta garansi harus diverifikasi.'),
 ('IPH-15-128','Apple iPhone 15 128GB','HANDPHONE',8500000,9400000,2,'unit','INV-KP-20261017-03','Estimasi harga pasar; distributor dan ketersediaan dapat berubah.'),
 ('IPH-16-128','Apple iPhone 16 128GB','HANDPHONE',10200000,11200000,2,'unit','INV-KP-20261017-03','Estimasi harga pasar; distributor dan ketersediaan dapat berubah.'),
 ('IPH-17-256','Apple iPhone 17 256GB','HANDPHONE',13000000,14200000,2,'unit','INV-KP-20261017-03','Estimasi harga pasar; distributor dan ketersediaan dapat berubah.'),
 ('IPH-17E-256','Apple iPhone 17e 256GB','HANDPHONE',11500000,12500000,2,'unit','INV-KP-20261017-03','Estimasi harga pasar; distributor dan ketersediaan dapat berubah.'),
 ('IPH-AIR-256','Apple iPhone Air 256GB','HANDPHONE',15500000,16800000,2,'unit','INV-KP-20261017-03','Estimasi harga pasar; konfirmasi varian dan ketersediaan Indonesia.'),
 ('IPH-18PRO-256','Apple iPhone 18 Pro 256GB','HANDPHONE',18500000,20500000,2,'unit','INV-KP-20261017-03','Harga provisional; konfirmasi ketersediaan resmi, varian dan garansi sebelum transaksi.'),
 ('IPH-18PM-256','Apple iPhone 18 Pro Max 256GB','HANDPHONE',21500000,23500000,2,'unit','INV-KP-20261017-03','Harga provisional; konfirmasi ketersediaan resmi, varian dan garansi sebelum transaksi.'),
 ('IPH-DUO-256','Apple iPhone Duo 256GB','HANDPHONE',25000000,27500000,2,'unit','INV-KP-20261017-03','Harga provisional untuk lini foldable; konfirmasi nama model, ketersediaan dan spesifikasi sebelum transaksi.')
),
new_products AS (
 INSERT INTO public.products(sku,barcode_value,name,category_id,unit,description,sale_price,current_stock,minimum_stock,storage_location,is_active,created_by)
 SELECT s.sku,s.sku,s.name,c.id,s.unit,
        s.description || ' Harga dan stok awal estimasi; SKU adalah kode internal, bukan barcode fisik terverifikasi.',
        s.sale_price,s.stock,1,'Gudang Kantor Pusat',true,'d4d16695-edd9-42ed-81ac-676eed6c0c03'::uuid
 FROM seed s JOIN categories c ON c.name=s.category_name
 WHERE NOT EXISTS(SELECT 1 FROM public.products p WHERE p.sku=s.sku)
 RETURNING id,sku
),
product_rows AS (
 SELECT id,sku FROM new_products
 UNION ALL
 SELECT p.id,p.sku FROM public.products p JOIN seed s ON s.sku=p.sku
 WHERE NOT EXISTS(SELECT 1 FROM new_products n WHERE n.sku=p.sku)
),
costs AS (
 INSERT INTO public.product_costs(product_id,cost_price,updated_by)
 SELECT p.id,s.cost_price,'d4d16695-edd9-42ed-81ac-676eed6c0c03'::uuid
 FROM product_rows p JOIN seed s ON s.sku=p.sku
 ON CONFLICT(product_id) DO NOTHING
 RETURNING product_id
),
movements AS (
 INSERT INTO public.stock_movements(product_id,movement_type,quantity,unit_cost,reference_code,reason,notes,created_by)
 SELECT p.id,'purchase_in',s.stock,s.cost_price,s.reference_code,
        'Pencatatan stok awal inventaris Kantor Pusat',
        'Estimasi sesuai arahan pemilik; cocokkan dengan barang fisik, faktur, garansi/IMEI bila relevan dan pembayaran.',
        'd4d16695-edd9-42ed-81ac-676eed6c0c03'::uuid
 FROM new_products p JOIN seed s ON s.sku=p.sku
 WHERE NOT EXISTS(SELECT 1 FROM public.stock_movements m WHERE m.product_id=p.id AND m.reference_code=s.reference_code)
 RETURNING id,reference_code
)
SELECT
 (SELECT COUNT(*) FROM categories) AS categories_upserted,
 (SELECT COUNT(*) FROM new_products) AS products_inserted,
 (SELECT COUNT(*) FROM costs) AS product_costs_upserted,
 (SELECT COUNT(*) FROM movements) AS stock_movements_inserted,
 0 AS expenses_inserted;
