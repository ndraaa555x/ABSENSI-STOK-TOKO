# SMART BUSINESS MANAGEMENT — Audit teknis dan rencana pemulihan

Tanggal pemeriksaan: 2026-10-14  
Status: hanya-baca; tidak ada perubahan produksi.

## Lingkup
- Produksi: https://smart-business-management-red.vercel.app/
- Repository: `ndraaa555x/ABSENSI-STOK-TOKO`
- Supabase project ref: `xgagttyxpngkjfowaasf`
- Domain, project Supabase, dan project Vercel saat ini harus dipertahankan.
- Organisasi awal untuk rencana SaaS: `NDRAAAID`.

## Temuan terverifikasi
1. Ada 19 tabel pada schema `public`; semuanya memiliki RLS aktif.
2. Inventaris sebelumnya menemukan 68 kebijakan RLS pada tabel `public` dan 7 kebijakan pada `storage.objects`.
3. Tidak ditemukan kolom `organization_id`, `tenant_id`, atau `workspace_id` pada tabel bisnis publik yang diperiksa. Sistem saat ini belum siap melayani beberapa organisasi dalam satu database.
4. Supabase mencatat 24 migrasi produksi. Direktori `supabase/migrations` di `main` memiliki 22 file; cabang `fix/refund-approval-feedback` memiliki satu file tambahan terkait `secure_refund_approval_rls`. Nama dan waktu migrasi produksi tidak selalu sama dengan nama file repo, jadi jumlah file tidak cukup untuk menyimpulkan file mana yang belum diterapkan. Cocokkan isi SQL dan struktur aktual sebelum replay.
5. Cabang `saas-foundation` berbeda dari `main` satu commit yang menambahkan dokumen rencana audit. Itu bukan implementasi tenant isolation atau SaaS.
6. Security Advisor melaporkan:
   - `public.post_order_finance_on_approval()`: SECURITY DEFINER dengan EXECUTE tercatat untuk `anon` dan `authenticated`.
   - Fungsi SECURITY DEFINER yang tersedia bagi pengguna terautentikasi: `set_product_stock`, `submit_product_order`, `submit_product_order_multi`, `submit_product_refund`.
   - Perlindungan kata sandi bocor dinonaktifkan.
   - Fungsi `post_order_finance_on_approval` terpasang pada trigger `trg_post_order_finance_on_approval` pada `product_orders`. Peringatan izin harus ditinjau; jangan menyimpulkan eksploitasi hanya dari ACL.
7. Query ACL tambahan menunjukkan beberapa fungsi lain memiliki EXECUTE untuk `anon`, termasuk `approve_financial_report`, `create_product_with_stock`, `fulfill_product_order`, dan `record_stock_movement`. Sebagian terdeteksi sebagai SECURITY INVOKER. Tinjau body, auth checks, RLS, dan kebutuhan akses satu per satu sebelum mengubah grant.
8. Performance Advisor menunjukkan 22 indeks belum terpakai dan 18 kelompok kebijakan permisif ganda. Ini bukan instruksi untuk menghapus indeks atau kebijakan; evaluasi dampak dan pola pemakaian dahulu.
9. Storage yang diperiksa:
   - `attendance-evidence`: 5 objek.
   - `order-payment-evidence`: 0 objek.
   Bucket Storage perlu backup terpisah; CSV tabel tidak menyertakan file biner.
10. Statistik perkiraan baris PostgreSQL bukan hitungan pasti: `profiles` 4, `employees` 3, `attendance_records` 2, `products` 1, `product_orders` 2, `product_order_items` 2, `product_refunds` 2, `financial_transactions` 5, `audit_logs` 70, `notifications` 20. Validasi dengan ekspor yang sudah dimiliki sebelum migrasi.

## Status cadangan
- Pengguna melaporkan sudah menyimpan 19 CSV dan ZIP kode.
- CSV adalah ekspor data terpilih, bukan cadangan penuh skema, fungsi, trigger, policy, Auth, konfigurasi, dan Storage.
- ZIP kode adalah snapshot kode, bukan dump database dan tidak otomatis mencakup cabang lain.
- Belum ada dump SQL lengkap yang berhasil dibuat dan diuji pemulihannya; backup lengkap belum terverifikasi.
- Jangan mengunggah file wajah/biometrik, CSV sensitif, atau secrets ke repository publik.

## Rencana pemulihan gratis sebelum perubahan produksi
1. Simpan CSV dan ZIP secara privat; jangan menghapus salinan asli.
2. Buat dump database lengkap menggunakan Supabase CLI `db dump` dari komputer tepercaya dengan Docker/koneksi database, simpan privat. Dokumentasi: https://supabase.com/docs/guides/platform/backups dan https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore.
3. Cadangkan objek Storage secara terpisah dan catat jumlah serta ukuran objek. Lindungi data wajah/absensi.
4. Cocokkan 24 catatan migrasi produksi dengan SQL pada seluruh cabang relevan berdasarkan isi, bukan hanya nama/timestamp.
5. Pulihkan dump ke lingkungan terisolasi dan verifikasi row counts, foreign keys, functions, triggers, policies, bucket metadata, dan file Storage sebelum mengubah produksi.
6. Catat prosedur rollback dan bukti pemulihan sebelum menjalankan migrasi.

## Urutan aman untuk SaaS
1. Tetap gunakan project/domain saat ini; tidak membuat project baru.
2. Petakan kepemilikan seluruh data lama ke organisasi `NDRAAAID` secara eksplisit.
3. Rancang tabel organisasi, keanggotaan, pengaturan organisasi, dan kolom organisasi pada semua tabel bisnis yang relevan.
4. Backfill secara bertahap dan verifikasi foreign keys.
5. Perbarui RLS, fungsi SECURITY DEFINER/RPC, Storage policies, Realtime, serta semua query aplikasi agar dibatasi ke organisasi pengguna.
6. Uji dua organisasi dummy untuk SELECT/INSERT/UPDATE/DELETE, RPC, Storage, dan Realtime. Semua akses silang harus ditolak.
7. Baru setelah itu implementasikan onboarding, role/permission per organisasi, paket, langganan, dan domain khusus.
8. Jangan aktifkan pendaftaran pelanggan atau menjual akses sebelum pengujian isolasi tenant lulus.

## Tindakan yang tidak dilakukan
- Tidak mengubah schema atau data produksi.
- Tidak mengubah grants/policies atau Auth settings.
- Tidak menjalankan/menyetujui refund atau transaksi keuangan.
- Tidak deploy, mengganti domain, membuat proyek baru, atau menggabungkan PR.
- Tidak mengklaim backup lengkap sudah selesai.
- Pemeriksaan Vercel deployment terbaru belum dapat diverifikasi: konektor ditolak dengan HTTP 403 untuk scope `ndraaa555x-5087`. Tidak ada perubahan pada proyek Vercel. Akses scope perlu dipulihkan oleh pemilik akun sebelum audit deployment dapat dilanjutkan.

## Status akhir audit
- Backup SQL penuh: **belum terverifikasi**.
- Isolasi SaaS multi-tenant: **belum siap**.
- Produksi: **tidak diubah**.
- Domain/proyek: **dipertahankan**.
