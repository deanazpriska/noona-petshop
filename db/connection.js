/**
 * Koneksi database SQLite sungguhan (via better-sqlite3).
 *
 * File database ada di data/noona.db — dibuat otomatis kalau belum ada.
 * Semua tabel dibuat otomatis (CREATE TABLE IF NOT EXISTS) saat modul ini
 * pertama kali di-require, jadi tidak perlu langkah migrasi manual.
 *
 * Saat database masih kosong (instalasi pertama kali), modul ini mengisi:
 *   - 1 akun admin (dari ADMIN_USERNAME / ADMIN_PASSWORD_HASH di .env)
 *   - 4 layanan grooming (sesuai price list PDF yang diberikan)
 * PRODUK SENGAJA TIDAK DI-SEED — katalog produk dimulai kosong supaya admin
 * mengisi sendiri lewat dashboard.
 *
 * ⚠️ Kalau kamu upgrade dari versi sebelumnya (yang masih pakai kolom
 * stock/status & price_from/price_unit), hapus dulu data/noona.db* lama
 * sebelum menjalankan versi ini — struktur tabel produk & layanan berubah.
 */
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "data", "noona.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    icon TEXT DEFAULT '🐾',
    image TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    variants TEXT NOT NULL DEFAULT '[]',      -- JSON: [{ "label": "100 gram", "price": 25000 }, ...] — kosong = harga tunggal
    available INTEGER NOT NULL DEFAULT 1,     -- 1 = tersedia, 0 = habis (toggle, bukan angka stok)
    status TEXT NOT NULL DEFAULT 'tersedia',  -- selalu mengikuti "available", disimpan supaya query filter gampang
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🐾',
    description TEXT DEFAULT '',
    tiers TEXT NOT NULL DEFAULT '[]',   -- JSON: [{ "label": "S (1-2.5 kg)", "price": 75000 }, ...]
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE NOT NULL,
    items_json TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'menunggu_pembayaran', -- menunggu_pembayaran | dibayar | dibatalkan
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
`);

// ---------- migrasi aman: tambah kolom "variants" kalau database lama belum punya ----------
// (database yang sudah berjalan sebelum fitur varian produk ditambahkan tidak akan
// otomatis dapat kolom baru dari CREATE TABLE IF NOT EXISTS di atas — jadi dicek manual di sini,
// data produk yang sudah ada TIDAK terhapus/berubah.)
const productColumns = db.prepare("PRAGMA table_info(products)").all().map((c) => c.name);
if (!productColumns.includes("variants")) {
  db.exec("ALTER TABLE products ADD COLUMN variants TEXT NOT NULL DEFAULT '[]'");
  console.log("🔧 Kolom \"variants\" ditambahkan ke tabel products (migrasi otomatis).");
}

// ---------- seed: admin user (sekali saja, kalau tabel users masih kosong) ----------
function seedAdminUser() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (count > 0) return;

  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!username || !passwordHash) {
    console.warn(
      "⚠️  ADMIN_USERNAME / ADMIN_PASSWORD_HASH belum diset di .env — akun admin belum dibuat."
    );
    return;
  }
  db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(
    username,
    passwordHash
  );
  console.log(`🔐 Akun admin awal dibuat untuk username "${username}".`);
}

// ---------- seed: layanan grooming sesuai price list PDF ----------
function seedServices() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM services").get().c;
  if (count > 0) return;

  const sizeTiers = (prices) => [
    { label: "S (1 - 2.5 kg)", price: prices[0] },
    { label: "M (2.6 - 4 kg)", price: prices[1] },
    { label: "L (4.1 - 5.3 kg)", price: prices[2] },
    { label: "XL (5.4 - 7.2 kg)", price: prices[3] },
    { label: "XXL (7.3 - 10 kg)", price: prices[4] },
  ];

  const services = [
    {
      name: "Basic Grooming",
      icon: "🛁",
      description: "Mandi, potong kuku, bersihkan telinga, parfum. Perawatan rutin harian.",
      tiers: sizeTiers([75000, 85000, 100000, 110000, 120000]),
    },
    {
      name: "Treatment Grooming",
      icon: "🧴",
      description:
        "Mandi pakai shampo khusus untuk mengatasi jamur & kutu, potong kuku, bersihkan telinga, parfum.",
      tiers: sizeTiers([85000, 105000, 110000, 120000, 130000]),
    },
    {
      name: "Luxury Grooming",
      icon: "✨",
      description:
        "Mandi pakai shampo mewah, potong kuku, rapikan bulu kaki, bersihkan telinga, parfum — paket paling lengkap.",
      tiers: sizeTiers([100000, 130000, 135000, 140000, 150000]),
    },
    {
      name: "Other Treatment",
      icon: "➕",
      description: "Layanan tambahan à la carte, bisa dipesan terpisah dari paket grooming.",
      tiers: [
        { label: "Lion Cut", price: 90000 },
        { label: "Paw / Butt Trimming", price: 20000 },
        { label: "Nail Trimming", price: 10000 },
        { label: "Ear Cleaning", price: 15000 },
        { label: "Matted Shaved", price: 25000 },
      ],
    },
  ];

  const insert = db.prepare(
    "INSERT INTO services (name, icon, description, tiers) VALUES (@name, @icon, @description, @tiers)"
  );
  const insertMany = db.transaction((rows) =>
    rows.forEach((r) => insert.run({ ...r, tiers: JSON.stringify(r.tiers) }))
  );
  insertMany(services);
  console.log(`🧾 ${services.length} layanan (dari price list PDF) berhasil di-seed ke database.`);
}

seedAdminUser();
seedServices();
// Produk sengaja TIDAK di-seed — lihat catatan di atas.

module.exports = db;
