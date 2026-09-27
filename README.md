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

⚠️ **Kalau kamu upgrade dari zip versi sebelumnya**, hapus dulu `data/noona.db`, `data/noona.db-wal`, dan `data/noona.db-shm` sebelum `npm start` — struktur tabel produk & layanan berubah di revisi ini (lihat bagian "Apa yang berubah" di bawah), jadi database lama tidak kompatibel.

Saat pertama kali dijalankan, server membuat `data/noona.db` dan mengisi (seed):
- 1 akun admin
- 4 layanan grooming (persis sesuai price list PDF yang kamu berikan)
- **Produk kosong** — sengaja tidak ada data contoh. Tambahkan produkmu sendiri lewat dashboard admin.

Login admin default (**ganti segera**):
- URL: `http://localhost:3000/admin/login`
- Username: `admin`
- Password: `noona123`

Nomor WhatsApp toko sudah diisi `628156587891` (dari price list yang kamu unggah) di `.env.example` sebagai `WA_NUMBER`. Ganti kalau perlu.

## Apa yang berubah di revisi ini

**1. Produk dummy dihapus.** Database sekarang dimulai kosong untuk tabel produk — tidak ada seed otomatis lagi. `scripts/generate-products.js` dan `data/seed-products.json` juga sudah dihapus dari proyek karena tidak dipakai lagi.

**2. Layanan disesuaikan dari PDF price list.** Struktur layanan diubah total dari "1 harga per layanan" menjadi **varian/tingkatan harga** (misal per ukuran S/M/L/XL/XXL), supaya cocok dengan cara Noona Petshop menetapkan harga grooming:
- **Basic Grooming** — mandi, potong kuku, bersihkan telinga, parfum
- **Treatment Grooming** — mandi shampo khusus jamur & kutu, potong kuku, bersihkan telinga, parfum
- **Luxury Grooming** — mandi shampo mewah, potong kuku, rapikan bulu kaki, bersihkan telinga, parfum
- **Other Treatment** — item à la carte: Lion Cut, Paw/Butt Trimming, Nail Trimming, Ear Cleaning, Matted Shaved

Jam operasional dari halaman "Jadwal" di PDF juga ditampilkan sebagai banner kecil di halaman publik (Pet Shop & Pet Clinic 09.00–21.00, Pet Grooming 09.00–16.00, tutup tiap Kamis).

Di dashboard admin, form layanan sekarang punya **editor varian dinamis** — tombol "+ Tambah varian" untuk menambah baris (nama varian + harga), dan tombol ✕ di tiap baris untuk menghapusnya. Bisa dipakai untuk varian ukuran (seperti grooming) maupun daftar item flat (seperti Other Treatment, tiap item jadi satu "varian").

**3. Stok produk jadi toggle, bukan angka.** Kolom "Stok" di tabel & form produk diganti jadi saklar **Tersedia / Habis** yang langsung tersimpan begitu diklik (tidak perlu tombol "Simpan" terpisah lagi). Cocok untuk toko yang tidak melacak jumlah stok persis, cuma perlu tahu ada/tidaknya barang.

**4. Tombol WhatsApp mengambang.** Pojok kanan bawah tiap halaman publik sekarang ada tombol bulat yang langsung membuka chat WhatsApp ke `WA_NUMBER` (dengan pesan pembuka umum) — terpisah dari alur konfirmasi pesanan/booking layanan yang sudah ada.

**5. Kategori status pesanan disesuaikan.** Status pesanan diganti jadi tiga kategori sesuai istilahmu:
- `menunggu_pembayaran` — **Menunggu Pembayaran** (status awal begitu pelanggan checkout)
- `dibayar` — **Telah Dibayar**
- `dibatalkan` — **Dibatalkan**

Admin mengubah status ini manual di tab "Pesanan" pada dashboard setelah mengecek pembayaran masuk (lihat penjelasan kenapa manual, bukan otomatis, di bagian "Alur belanja" di bawah).

**6. Emoji dihapus dari pesan konfirmasi pesanan.** Pesan WhatsApp yang terkirim setelah checkout sekarang teks polos tanpa emoji.

## Alur belanja: keranjang → QRIS → konfirmasi WhatsApp

1. Pelanggan tambah produk ke **keranjang** (`localStorage` browser, jadi tidak hilang saat refresh).
2. Klik **"Bayar dengan QRIS"** → sistem membuat **pesanan** lewat `POST /api/orders`. Harga & nama produk **dihitung ulang dari database**, bukan dari data yang dikirim browser.
3. Muncul QR code (demo) beserta nomor order & total. Status pesanan otomatis **"Menunggu Pembayaran"**.
4. Pelanggan tekan **"Sudah Bayar — Konfirmasi via WhatsApp"** → terbuka chat WhatsApp ke `WA_NUMBER` dengan pesan berisi nomor order, daftar item, dan total. Keranjang otomatis dikosongkan.
5. Admin melihat pesanan ini di tab **"Pesanan"**, mencocokkan dengan chat WhatsApp & bukti transfer, lalu ubah status jadi **Telah Dibayar** atau **Dibatalkan**.

QRIS yang tampil adalah **simulasi**, bukan payload QRIS resmi — payment gateway berlisensi (Xendit, Midtrans, dll) perlu akun bisnis yang cuma bisa didaftarkan sendiri olehmu. Ketersediaan produk (toggle tersedia/habis) juga **tidak berubah otomatis** saat ada pesanan masuk — itu tetap dikontrol manual admin di tab Produk.

Layanan (grooming) tetap booking langsung via WhatsApp (bukan lewat keranjang), karena sifatnya jadwal kunjungan, bukan barang yang bisa dihitung jumlahnya.

## Autentikasi admin

Sama seperti sebelumnya: akun tersimpan di tabel `users` pada `data/noona.db`, session di server (cookie `httpOnly`), middleware `requireAuth` mengunci halaman `/admin/dashboard` & semua API tulis.
- **Ganti password**: ikon 🔑 di dashboard, atau `node scripts/reset-admin-password.js password-baru-kamu`

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
