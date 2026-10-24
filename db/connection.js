/**
 * Koneksi database PostgreSQL (Supabase) via library "pg".
 *
 * Semua data (admin, produk, layanan, pesanan, session login) disimpan di Supabase,
 * BUKAN di file lokal — jadi aman walaupun server tempat deploy di-restart atau
 * di-deploy ulang (filesystem server gratisan biasanya sementara).
 *
 * Tabel dibuat otomatis lewat initDatabase() saat server start (CREATE ... IF NOT EXISTS),
 * lalu mengisi (seed) kalau masih kosong:
 *   - 1 akun admin (dari ADMIN_USERNAME / ADMIN_PASSWORD_HASH di .env)
 *   - layanan bawaan Grooming, Pet Care, Pet Hotel — SEKALI SAJA (db/services-seed-data.js)
 * PRODUK SENGAJA TIDAK DI-SEED — katalog dimulai kosong, diisi admin lewat dashboard.
 *
 * Keamanan: semua tabel di-set Row Level Security (RLS) tanpa policy. Artinya tabel
 * TIDAK bisa dibaca lewat Data API Supabase memakai anon key; hanya server ini
 * (yang konek langsung lewat DATABASE_URL) yang bisa mengakses.
 */
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error(
    "❌ DATABASE_URL belum diisi di .env. Ambil dari Supabase: Project > Connect > connection string."
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase mewajibkan koneksi SSL. Set DB_SSL=false hanya untuk Postgres lokal tanpa SSL.
  ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX) || 5,
});

pool.on("error", (err) => {
  console.error("Koneksi database error:", err.message);
});

// Helper: kembalikan array baris
async function all(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

// Helper: kembalikan satu baris (atau undefined)
async function get(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows[0];
}

// Helper: jalankan query tulis, kembalikan jumlah baris yang terpengaruh
async function run(text, params = []) {
  const res = await pool.query(text, params);
  return res.rowCount;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    icon TEXT DEFAULT '🐾',
    image TEXT,                                 -- URL publik foto di Supabase Storage
    price INTEGER NOT NULL DEFAULT 0,
    variants JSONB NOT NULL DEFAULT '[]',       -- [{ "label": "100 gram", "price": 25000 }, ...]
    available INTEGER NOT NULL DEFAULT 1,       -- 1 = tersedia, 0 = habis (toggle, bukan angka stok)
    status TEXT NOT NULL DEFAULT 'tersedia',    -- selalu mengikuti "available"
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🐾',
    description TEXT DEFAULT '',
    category TEXT NOT NULL DEFAULT 'grooming',  -- grooming | pet-care | pet-hotel
    tiers JSONB NOT NULL DEFAULT '[]',          -- [{ "label": "S (1-2.5 kg)", "price": 75000 }, ...]
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_code TEXT UNIQUE NOT NULL,
    items_json JSONB NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'menunggu_pembayaran', -- menunggu_pembayaran | dibayar | dibatalkan
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Tabel session login admin (dipakai connect-pg-simple)
  CREATE TABLE IF NOT EXISTS session (
    sid VARCHAR NOT NULL PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
  );

  -- Penanda sekali-jalan (mis. "isi layanan bawaan sudah dilakukan") supaya tidak diulang
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);

  -- Kunci akses dari Data API Supabase (anon key): RLS aktif tanpa policy = ditolak semua.
  ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE products ENABLE ROW LEVEL SECURITY;
  ALTER TABLE services ENABLE ROW LEVEL SECURITY;
  ALTER TABLE orders   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE session  ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app_meta ENABLE ROW LEVEL SECURITY;
`;

async function seedAdminUser() {
  const { c } = await get("SELECT COUNT(*)::int AS c FROM users");
  if (c > 0) return;

  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!username || !passwordHash) {
    console.warn(
      "⚠️  ADMIN_USERNAME / ADMIN_PASSWORD_HASH belum diset di .env — akun admin belum dibuat."
    );
    return;
  }
  await run("INSERT INTO users (username, password_hash) VALUES ($1, $2)", [
    username,
    passwordHash,
  ]);
  console.log(`🔐 Akun admin awal dibuat untuk username "${username}".`);
}

/**
 * Isi layanan bawaan (Grooming, Pet Care, Pet Hotel) SATU KALI SAJA.
 *
 * - Hanya menambah layanan yang belum ada (nama + kategori sama), yang sudah ada tidak diubah.
 * - Setelah selesai, dicatat di tabel app_meta ("services_seed_v1"). Sesudah itu fungsi ini
 *   tidak pernah jalan lagi, jadi layanan yang kamu hapus/ubah lewat dashboard admin
 *   TIDAK akan dikembalikan oleh restart atau deploy ulang.
 */
async function seedServices() {
  const done = await get("SELECT 1 FROM app_meta WHERE key = 'services_seed_v1'");
  if (done) return;

  const { SERVICES } = require("./services-seed-data");
  let added = 0;
  for (const s of SERVICES) {
    const exists = await get("SELECT 1 FROM services WHERE category = $1 AND name = $2", [
      s.category,
      s.name,
    ]);
    if (exists) continue;
    await run(
      "INSERT INTO services (name, icon, description, category, tiers) VALUES ($1, $2, $3, $4, $5)",
      [s.name, s.icon, s.description, s.category, JSON.stringify(s.tiers)]
    );
    added++;
  }
  await run("INSERT INTO app_meta (key, value) VALUES ('services_seed_v1', 'done') ON CONFLICT (key) DO NOTHING");
  console.log(`🧾 Seed layanan bawaan selesai: ${added} layanan ditambahkan (sekali jalan).`);
}

/** Buat tabel kalau belum ada (aman dipanggil berulang). */
function initSchema() {
  return pool.query(SCHEMA_SQL);
}

/** Isi data awal (admin + layanan grooming) HANYA kalau tabelnya masih kosong. */
async function seedAll() {
  await seedAdminUser();
  await seedServices();
  // Produk sengaja TIDAK di-seed — lihat catatan di atas.
}

/** Dipanggil sekali saat server start. */
async function initDatabase() {
  await initSchema();
  await seedAll();
}

module.exports = { pool, all, get, run, initSchema, seedAll, initDatabase };
