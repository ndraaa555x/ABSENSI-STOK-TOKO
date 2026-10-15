# Modul Toko Offline

Modul Next.js tersedia di `/offline-store` dan ditautkan dari navigasi utama.

## Kebijakan yang diterapkan

- Produk khusus toko disimpan di `offline_store_products` dan tidak mengubah katalog pusat.
- Pengajuan katalog pusat disimpan dalam `offline_product_submissions`. Produk pusat serta kategori baru baru dibuat ketika Owner/Admin menyetujui pengajuan.
- SKU, barcode, nama produk, serta pengajuan tertunda divalidasi untuk mengurangi duplikasi.
- Stok toko terpisah dari stok pusat. Penerimaan dicatat sebagai dokumen dan baru menambah stok saat dikonfirmasi.
- Harga modal dicatat per batch penerimaan melalui `offline_product_cost_batches`.
- Harga jual disimpan per toko.
- Kebijakan diskon awal: kasir maksimal 5%, manager maksimal 15%; Owner/Admin dapat mengatur ulang batasnya.
- Penjualan memvalidasi keanggotaan toko, stok, metode pembayaran, dan batas diskon di database.
- Perubahan utama ditulis ke `audit_logs`.

## Tabel

- `offline_stores`
- `offline_store_memberships`
- `offline_store_categories`
- `offline_store_products`
- `offline_product_submissions`
- `offline_stock_receipts`, `offline_stock_receipt_items`
- `offline_product_cost_batches`
- `offline_store_discount_policies`, `offline_store_discounts`
- `offline_store_sales`, `offline_store_sale_items`

Semua tabel modul mengaktifkan RLS. Peran operasional per toko (manager, inventory, cashier) disimpan terpisah dari peran global pada `profiles`.

## RPC database

- `create_offline_store`
- `assign_offline_store_member`
- `create_offline_local_product`
- `submit_offline_product`
- `review_offline_product_submission`
- `create_offline_stock_receipt`
- `receive_offline_stock`
- `save_offline_discount_policy`
- `create_offline_discount`
- `complete_offline_store_sale`

RPC yang melakukan perubahan memeriksa autentikasi dan kewenangan sebelum menulis data.

## Penggunaan

1. Owner/Admin membuka menu **Toko Offline**, membuat toko, lalu memberi anggota akses dengan role toko yang sesuai.
2. Manager/petugas stok dapat membuat produk lokal, mengajukan produk pusat, dan mencatat penerimaan stok.
3. Owner/Admin meninjau pengajuan produk pada tab **Persetujuan Admin**. Jika kategori belum ada, admin dapat menyetujui pembuatan kategori saat persetujuan.
4. Manager mengatur batas diskon dan membuat promo terjadwal.
5. Kasir melakukan penjualan dari tab **Kasir / POS**. Penjualan yang berhasil mengurangi stok toko secara atomik.

## Catatan deployment

Schema dan RPC telah diterapkan pada proyek Supabase yang terhubung selama implementasi ini. Sebelum deployment production, jalankan build Next.js dan tinjau hasil Supabase Security/Performance Advisors. Preview Vercel dan pengujian end-to-end tetap perlu diperiksa setelah pull request dibuat.
