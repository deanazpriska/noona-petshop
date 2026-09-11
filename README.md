# Noona Petshop — E-Katalog

Website e-katalog dengan tiga area:
- **Publik** (`/`) — pelanggan lihat produk & layanan (harga per varian ukuran), cari/filter produk, masukkan ke keranjang, checkout QRIS, konfirmasi otomatis lewat WhatsApp. Ada juga tombol WhatsApp mengambang untuk kontak langsung.
- **Admin** (`/admin`) — satu akun admin untuk kelola produk (dengan toggle tersedia/habis), layanan (dengan varian harga), dan pesanan masuk.
- **Database** — SQLite sungguhan (`better-sqlite3`).

## Menjalankan di lokal

```bash
npm install
cp .env.example .env      # kalau belum ada .env
npm start                 # jalan di http://localhost:3000
```

Saat pertama kali dijalankan, server membuat `data/noona.db` dan mengisi (seed):
- 1 akun admin
- 4 layanan grooming (persis sesuai price list PDF yang kamu berikan)
- **Produk kosong** — sengaja tidak ada data contoh. Tambahkan produkmu sendiri lewat dashboard admin.

Login admin default:
- URL: `http://localhost:3000/admin/login`
- Username: `admin`
- Password: `noona123`

## Autentikasi admin

Akun tersimpan di tabel `users` pada `data/noona.db`, session di server (cookie `httpOnly`), middleware `requireAuth` mengunci halaman `/admin/dashboard` & semua API tulis.
- **Ganti password**: ikon 🔑 di dashboard, atau `node scripts/reset-admin-password.js password-baru`

## Struktur proyek

```
server.js                       Entry point Express + session + routing
middleware/auth.js               requireAuth — kunci semua route/API admin
routes/auth.routes.js             login, logout, cek status login, ganti password
routes/products.routes.js          GET publik + POST/PUT/DELETE admin-only + toggle availability + upload foto
routes/services.routes.js           GET publik + POST/PUT/DELETE admin-only (tiers)
routes/orders.routes.js              POST publik (buat pesanan) + GET/PATCH admin-only (status)
db/connection.js                      Skema tabel + seed admin & layanan (produk sengaja kosong)
db/products.js                         Query produk, termasuk toggle available
db/services.js                          Query layanan dengan tiers (JSON per baris)
db/users.js                              Query akun admin
db/orders.js                              Query pesanan, hitung ulang harga dari DB
scripts/hash-password.js                  Utilitas cetak hash password (untuk .env)
scripts/reset-admin-password.js            Reset password admin langsung di database
public/                                     Frontend PUBLIK (index.html, css, js, logo, uploads foto)
admin/                                       Frontend ADMIN (login.html, dashboard.html, css, js)
```

## Catatan & batasan penting

- **Session di memori server** — restart server = semua logout. Untuk production, pakai session store persisten (Redis/`connect-sqlite3`).
- Sebelum online: ganti `SESSION_SECRET`, aktifkan `cookie.secure = true` (butuh HTTPS), ganti password admin default.
- Gambar produk pakai ikon emoji sebagai default; upload foto asli lewat form produk (JPG/PNG/WEBP, maks 3MB).
- `data/noona.db` tidak ikut ter-zip/ter-commit (`.gitignore`) — tiap setup baru mulai dari database kosong (kecuali layanan & admin yang di-seed otomatis).
