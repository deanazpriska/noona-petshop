require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");

const { requireAuth } = require("./middleware/auth");
const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/products.routes");
const serviceRoutes = require("./routes/services.routes");
const orderRoutes = require("./routes/orders.routes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ---------- Session (menyimpan status login di server, cookie hanya berisi id) ----------
app.use(
  session({
    name: "connect.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-ganti-ini",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // tidak bisa diakses lewat JS di browser (mitigasi XSS)
      sameSite: "lax", // mitigasi CSRF dasar
      maxAge: 1000 * 60 * 60 * 4, // 4 jam
      // secure: true, // AKTIFKAN saat sudah pakai HTTPS di production
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

app.listen(PORT, () => {
  console.log(`\n🐾 Noona Pet Shop e-katalog berjalan di http://localhost:${PORT}`);
  console.log(`   Katalog publik : http://localhost:${PORT}/`);
  console.log(`   Login admin    : http://localhost:${PORT}/admin/login\n`);
});
