require("dotenv").config();
const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const path = require("path");

const { pool, initDatabase } = require("./db/connection");
const storage = require("./db/storage");

const { requireAuth } = require("./middleware/auth");
const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/products.routes");
const serviceRoutes = require("./routes/services.routes");
const orderRoutes = require("./routes/orders.routes");

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

// Di balik proxy hosting (Render, Railway, dsb.) koneksi HTTPS diterminasi di proxy.
// Tanpa ini, cookie "secure" tidak akan pernah dikirim dan login admin gagal.
if (IS_PROD) app.set("trust proxy", 1);

app.use(express.json());

// ---------- Session (menyimpan status login di server, cookie hanya berisi id) ----------
app.use(
  session({
    // Session disimpan di database Supabase (tabel "session"), bukan di memori server,
    // jadi admin tidak ter-logout setiap server restart/deploy ulang.
    store: new PgSession({ pool, tableName: "session" }),
    name: "connect.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-ganti-ini",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // tidak bisa diakses lewat JS di browser (mitigasi XSS)
      sameSite: "lax", // mitigasi CSRF dasar
      maxAge: 1000 * 60 * 60 * 4, // 4 jam
      secure: IS_PROD, // aktif otomatis di production (wajib HTTPS) lewat NODE_ENV=production
    },
  })
);

// ---------- API ----------
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/orders", orderRoutes);

// Konfigurasi publik yang aman dibagikan ke frontend (bukan rahasia)
app.get("/api/config", (req, res) => {
  res.json({ waNumber: process.env.WA_NUMBER || "" });
});

// Supaya browser tidak pernah salah tebak encoding file (penyebab umum emoji/karakter
// jadi rusak, mis. ✅ berubah jadi simbol aneh) — paksa charset UTF-8 secara eksplisit
// untuk semua file statis (JS, CSS, HTML) yang dikirim ke browser.
const staticOptions = {
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/i.test(filePath)) {
      const type = filePath.endsWith(".js")
        ? "application/javascript"
        : filePath.endsWith(".css")
        ? "text/css"
        : "text/html";
      res.setHeader("Content-Type", `${type}; charset=utf-8`);
    }
  },
};

// ---------- Area PUBLIK: katalog pelanggan (read-only, tanpa login) ----------
app.use(express.static(path.join(__dirname, "public"), staticOptions));

// Rute layanan (/layanan/grooming, /layanan/pet-care, /layanan/pet-hotel) dirender di
// sisi klien (lihat public/js/catalog.js) — jadi kalau diakses/refresh langsung dari
// browser, server cukup mengirim index.html yang sama, lalu JS yang menentukan tampilannya.
const LAYANAN_CATEGORIES = ["grooming", "pet-care", "pet-hotel"];
app.get("/layanan/:category", (req, res, next) => {
  if (!LAYANAN_CATEGORIES.includes(req.params.category)) return next();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- Area ADMIN ----------
// Halaman login: publik (harus bisa diakses tanpa login, untuk login itu sendiri)
app.get("/admin/login", (req, res) => {
  // kalau sudah login, langsung lempar ke dashboard
  if (req.session && req.session.isAdmin) return res.redirect("/admin/dashboard");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.sendFile(path.join(__dirname, "admin", "login.html"));
});

// Aset admin (css/js) — aman untuk publik karena tidak berisi data,
// dan semua panggilan API di dalamnya tetap ditolak server jika belum login.
app.use("/admin/css", express.static(path.join(__dirname, "admin", "css"), staticOptions));
app.use("/admin/js", express.static(path.join(__dirname, "admin", "js"), staticOptions));

// Halaman dashboard: DIKUNCI oleh middleware requireAuth.
// Ini kunci utamanya — dashboard.html TIDAK di-serve lewat express.static,
// jadi satu-satunya jalan mengaksesnya adalah lolos requireAuth di bawah ini.
app.get("/admin/dashboard", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.sendFile(path.join(__dirname, "admin", "dashboard.html"));
});

// /admin polos -> arahkan sesuai status login
app.get("/admin", (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect("/admin/dashboard");
  res.redirect("/admin/login");
});

// ---------- 404 fallback untuk API ----------
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan." });
});

// ---------- Error handler (menangkap error dari route async) ----------
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (req.originalUrl.startsWith("/api/")) {
    return res.status(500).json({ error: "Terjadi kesalahan pada server. Coba lagi sebentar." });
  }
  res.status(500).send("Terjadi kesalahan pada server.");
});

// ---------- Start: siapkan database & bucket foto dulu, baru buka port ----------
async function main() {
  await initDatabase();
  await storage.ensureBucket();

  app.listen(PORT, () => {
    console.log(`\n🐾 Noona Pet Shop e-katalog berjalan di port ${PORT}`);
    console.log(`   Katalog publik : http://localhost:${PORT}/`);
    console.log(`   Login admin    : http://localhost:${PORT}/admin/login\n`);
  });
}

main().catch((err) => {
  console.error("❌ Gagal start server:", err.message);
  process.exit(1);
});
