# SMART BUSINESS MANAGEMENT

Aplikasi Next.js untuk absensi, inventaris/stok, keuangan, barcode, dan pengelolaan akses OWNER/ADMIN dengan Supabase.

## Fitur fondasi
- Login dan logout melalui Supabase Auth.
- Dashboard dengan ringkasan data dari database.
- Menu dasar untuk karyawan, absensi, inventaris/barcode, keuangan, dan pengaturan.
- Akses data tetap mengikuti Row Level Security (RLS) yang sudah dikonfigurasi di Supabase.

## Menjalankan lokal
1. Salin `.env.example` menjadi `.env.local`.
2. Isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` dari Supabase Dashboard.
3. Jalankan `npm install`, kemudian `npm run dev`.

## Keamanan
- Jangan masukkan `service_role` key atau secret key ke variabel `NEXT_PUBLIC_*`, browser, atau GitHub.
- Role diambil dari `public.profiles`, bukan dari user metadata yang bisa diedit pengguna.
- Kebijakan RLS Supabase tetap menjadi lapisan kontrol akses database.
- Fitur lanjutan harus diuji terhadap kebijakan RLS sebelum digunakan pada data operasional.

## Deployment
Hubungkan repository ini ke Vercel dan atur dua environment variable publik yang disebutkan di atas. Vercel akan membangun aplikasi dengan `npm run build`.
