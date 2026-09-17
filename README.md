# AY GYM PT ONLINE

Sistem Personal Trainer AY GYM berbasis Supabase + Vercel.

## Fitur
- Login email/password
- Role Admin, PT/Trainer, Klien
- Data klien dan paket PT
- Jumlah sesi terpakai / total
- Pertemuan ke-1, ke-2, dst.
- Tanggal, durasi, berat, lingkar pinggang, body fat
- Fokus latihan dan catatan
- Gerakan, muscle group, beban, set, reps, rest, RPE
- Dashboard
- Portal progress klien
- Role-based access dengan Supabase RLS

## Setup

### 1. Buat project Supabase
Buat project baru di Supabase.

### 2. Database
Buka SQL Editor lalu jalankan seluruh isi `supabase-schema.sql`.

### 3. Buat akun admin
Daftar akun pertama melalui website.
Setelah akun berhasil dibuat, jalankan:

update public.profiles
set role = 'admin'
where email = 'EMAIL_ADMIN';

Ganti EMAIL_ADMIN dengan email akun admin.

### 4. Hubungkan website
Buka `app.js`, isi:

const SUPABASE_URL = "https://xxxxx.supabase.co";
const SUPABASE_KEY = "publishable-or-anon-key";

Gunakan publishable/anon key, JANGAN service_role key.

### 5. Deploy ke Vercel
Upload folder ini ke Vercel Drop atau hubungkan ke GitHub.

Setelah deploy, buka website dan login.

## Catatan keamanan
RLS sudah disiapkan agar Admin dapat mengelola semua data, Trainer mengelola kliennya, dan Client hanya melihat data miliknya.
Jangan pernah memasukkan `service_role` key ke JavaScript frontend.
