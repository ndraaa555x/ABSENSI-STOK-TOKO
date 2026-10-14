# KEMBALIKAN — Checkpoint sebelum rombakan besar

Dibuat: 2026-10-14 (Asia/Jakarta)
Tujuan: menandai versi kode dan konfigurasi yang ada sebelum perubahan besar SMART BUSINESS MANAGEMENT.

## Lokasi yang dipertahankan

- GitHub repository: https://github.com/ndraaa555x/ABSENSI-STOK-TOKO
- Branch checkpoint: `KEMBALIKAN`
- Basis kode saat checkpoint dibuat: `b238a87d8b69497ac5ae45cb68ad90dbbef75144` (main; deployment produksi READY saat diperiksa)
- Supabase project ref: `xgagttyxpngkjfowaasf` (status ACTIVE_HEALTHY; region ap-northeast-1; PostgreSQL 17)
- Vercel project: `smart-business-management`
- Vercel production deployment ID: `dpl_8ASthRGRQKyfcp7dhNdGgUvgVvar`
- Deployment URL: https://smart-business-management-7455wgqvj-ndraaa555x-5087.vercel.app
- Domain produksi: https://smart-business-management-red.vercel.app
- Commit yang dipakai deployment: `b238a87d8b69497ac5ae45cb68ad90dbbef75144`

## File yang dicadangkan di branch ini

- Seluruh riwayat kode Git pada basis commit di atas, melalui branch `KEMBALIKAN`.
- Snapshot sumber Edge Function Supabase:
  - `supabase/functions/purge-attendance-evidence/index.ts`
  - `supabase/functions/manage-employee-accounts/index.ts`
- File migrasi SQL yang sudah ada pada commit basis (termasuk skema bisnis dan audit actor identity).

## Pemeriksaan data Supabase pada saat checkpoint

- public.profiles: 3 baris
- public.audit_logs: 50 baris
- public.financial_categories: 1 baris
- public.app_settings: 1 baris
- Tabel operasional lain yang diperiksa (produk, kategori produk, order, detail order, refund, transaksi keuangan, laporan keuangan, stok, karyawan, absensi, cuti, pelanggan, notifikasi, template wajah): 0 baris.
- Auth users: 3 akun pada saat pemeriksaan; hanya metadata akun yang diperiksa, bukan hash kata sandi/token.
- Storage buckets: `attendance-evidence` dan `order-payment-evidence`, keduanya private.
- Storage object metadata: 3 objek gambar bukti pada saat pemeriksaan.

## Batas penting — jangan salah menganggap ini sebagai full physical backup

Branch ini adalah checkpoint kode, bukan backup database yang bisa dipulihkan sepenuhnya dengan satu klik. MCP yang tersedia tidak menyediakan ekspor native `pg_dump`, backup biner database, atau unduhan isi objek Storage secara langsung. Metadata Storage sudah diperiksa, tetapi isi biner 3 gambar belum disalin ke arsip. Hash kata sandi, token sesi, dan secret server tidak diekspor. Environment variables Vercel yang terbaca hanya dua variabel publik Supabase; jangan pernah menyimpan service_role key di GitHub.

Sebelum operasi destruktif pada database atau Storage, buat/unduh backup native Supabase dari Dashboard atau melalui mekanisme backup resmi, dan salin file Storage private secara terautentikasi. Jangan menghapus atau mengubah data produksi hanya karena branch ini sudah dibuat.

## Cara menemukan checkpoint

Cari branch GitHub bernama `KEMBALIKAN`. Untuk mengembalikan kode, gunakan branch/commit checkpoint ini sebagai sumber pemulihan; jangan langsung menggabungkan ke `main` tanpa meninjau perubahan. Pemulihan database dan Storage adalah langkah terpisah.
