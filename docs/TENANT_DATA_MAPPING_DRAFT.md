# Tenant Data Mapping — Draft, belum untuk produksi

Tanggal: 2026-10-14  
Project: SMART BUSINESS MANAGEMENT / organisasi awal `NDRAAAID`  
Status: dokumentasi desain berdasarkan metadata schema saat ini; **bukan migrasi SQL**.

## Prinsip wajib
- Jangan menambah tenant columns atau mengubah RLS produksi sebelum full backup dan restore test berhasil.
- Satu organisasi harus menjadi pemilik tunggal setiap data bisnis.
- Jangan percaya `profiles.role` atau metadata dari browser sebagai bukti keanggotaan organisasi.
- Setiap child row harus berada di organisasi yang sama dengan parent row yang dirujuk.
- Jangan memindahkan data wajah/absensi atau bukti pembayaran lintas organisasi tanpa pemeriksaan eksplisit.
- Hindari global unique constraints untuk nilai yang seharusnya hanya unik dalam satu organisasi; ganti dengan unique index yang mencakup `organization_id` setelah semua query dan FK ditinjau.

## Entitas platform yang diusulkan
1. `organizations`: id UUID, slug, name, status, created_at, updated_at.
2. `organization_members`: organization_id, profile_id, member_role, status, invited_by, joined_at. Unique (organization_id, profile_id).
3. `organization_settings`: organization_id, setting_key, setting_value, updated_by; unique (organization_id, setting_key).
4. `subscription_plans` dan `subscriptions`: rencana, batas fitur/kuota, status langganan, masa berlaku dan grace period. Pembayaran tidak boleh diaktifkan sebelum alur penagihan dan webhook aman dirancang.
5. `organization_domains`: domain/subdomain tervalidasi; kepemilikan domain dan verifikasi harus dilakukan server-side.
6. `platform_roles` atau permission platform terpisah dari role perusahaan. Hak platform Super Admin tidak boleh dapat diberikan oleh Owner organisasi.

## Peta tabel yang harus tenant-scoped
| Tabel | Relasi/pemilik yang terlihat | Perlakuan saat migrasi |
|---|---|---|
| `employees` | Memiliki `profile_id`; direferensikan oleh absensi, cuti, template wajah | Tenant-owned; tentukan organisasi setiap pegawai dan pastikan profile member organisasi yang sama |
| `attendance_records` | `employee_id` → employees; `recorded_by` → profiles | Tenant-owned; organisasi harus cocok dengan pegawai dan pencatat |
| `leave_requests` | `employee_id` → employees; reviewer profile | Tenant-owned; reviewer harus anggota organisasi yang sama |
| `employee_face_templates` | `employee_id` → employees; `created_by` → profiles | Tenant-owned dan sangat sensitif; batasi akses, consent, retention, dan akses server-side |
| `product_categories` | Direferensikan oleh products | Tenant-owned; nama kategori unik per organisasi, bukan global |
| `products` | `category_id` → product_categories | Tenant-owned; SKU/barcode uniqueness harus ditinjau dan umumnya dibatasi per organisasi |
| `product_costs` | `product_id` → products | Tenant-owned; organisasi harus sama dengan produk |
| `stock_movements` | `product_id` → products | Tenant-owned; mutasi stok tidak boleh dibuat lintas organisasi |
| `product_orders` | `ordered_by`, reviewer, `customer_id` | Tenant-owned; pemesan, reviewer, pelanggan dan order harus berada dalam organisasi sama |
| `product_order_items` | `order_id` → product_orders; `product_id` → products | Tenant-owned; order dan produk wajib organisasi yang sama |
| `product_refunds` | `order_id`, `order_item_id`, pemohon/reviewer | Tenant-owned; order, item, transaksi yang diposting dan pengguna harus cocok organisasi |
| `business_customers` | `created_by` → profiles; direferensikan order/laporan | Tenant-owned; pelanggan tidak boleh digunakan antar-organisasi |
| `financial_categories` | Kategori transaksi keuangan | Tenant-owned; nama/jenis unik per organisasi bila diperlukan |
| `financial_transactions` | `category_id`, pembuat, referensi bukti | Tenant-owned; setiap posting order/refund wajib membawa organisasi yang sama |
| `financial_reports` | Order/customer terkait; submitter/reviewer | Tenant-owned; laporan hanya dapat mengaitkan data dari organisasi sama |
| `app_settings` | Key/value pengaturan bisnis | Tenant-scoped; ubah kunci tunggal menjadi unique (organization_id, setting_key) |
| `notifications` | `user_id` → profiles | Tenant-scoped untuk notifikasi bisnis; validasi penerima sebagai anggota organisasi |
| `audit_logs` | `actor_id` → profiles dan detail entity | Tenant-scoped untuk audit bisnis; batasi detail sensitif dan akses ekspor |
| `profiles` | Identitas global terhubung ke `auth.users` | Jangan otomatis membuat satu profile per organisasi; satu user mungkin anggota beberapa organisasi. Organisasi berada di tabel keanggotaan |

## Aturan RLS/FK yang wajib diterapkan dalam desain
- Semua tabel bisnis tenant-owned harus memiliki `organization_id NOT NULL` setelah backfill tervalidasi.
- Membership dicek dari tabel `organization_members` yang statusnya aktif, menggunakan helper SQL yang aman dan tidak bisa dimanipulasi client.
- Child-parent isolation harus dipaksa server-side. Contoh: `product_order_items.organization_id` harus sama dengan organisasi order dan produk, bukan hanya diperiksa di UI.
- Untuk relasi lintas tabel, pertimbangkan unique key `(organization_id, id)` dan composite foreign keys bila sesuai dengan skema, agar konsistensi tenant dijaga oleh database.
- RLS harus mencakup SELECT, INSERT, UPDATE, DELETE. Audit juga semua RPC, SECURITY DEFINER, trigger, views, Realtime publication, Storage objects/policies, Edge Functions, dan query frontend.
- Storage path wajib menyertakan ID organisasi, tetapi path saja bukan kontrol keamanan; Storage RLS harus memverifikasi membership.
- Super Admin platform dipisahkan dari Owner/Admin/HRD/Employee perusahaan. Semua perubahan role/keanggotaan dicatat di audit log.

## Urutan implementasi non-produksi
1. Lengkapi inventaris semua FK, unique constraints/indexes, policies, functions, triggers, views, realtime, dan Storage policies.
2. Verifikasi pemetaan seluruh data lama ke `NDRAAAID`; jangan menebak berdasarkan nama atau role.
3. Siapkan full SQL dump dan cadangan Storage; pulihkan ke environment terisolasi.
4. Implementasikan schema additive pada branch dan database pengujian saja.
5. Backfill dengan transaksi terkendali; bandingkan row counts, relasi, unique constraints, serta total finansial/stok.
6. Uji dua organisasi dummy untuk seluruh operasi dan RPC. Akses silang wajib ditolak.
7. Jalankan build/lint/test, review migration, backup baru, dan prosedur rollback.
8. Jadwalkan rollout produksi hanya setelah semua gerbang di atas lulus.

## Status
Belum ada SQL tenant migration yang diterapkan. Dokumen ini tidak mengubah aplikasi, database, domain, atau deployment.
