/**
 * Pindahkan data lama dari SQLite (data/noona.db) ke Supabase — SEKALI JALAN.
 *
 * Yang dipindahkan: akun admin, produk, layanan, dan pesanan.
 * Foto produk di public/uploads/products/ diunggah ke Supabase Storage,
 * lalu kolom `image` di produk diganti dengan URL barunya.
 *
 * Aman dijalankan ulang: baris yang sudah ada (berdasarkan sku / order_code / username)
 * dilewati, bukan digandakan. Data di SQLite TIDAK diubah/dihapus.
 *
 * Cara pakai:
 *   1. Isi .env (DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 *   2. npm install --no-save better-sqlite3      (hanya dibutuhkan untuk migrasi ini)
 *   3. node scripts/migrate-from-sqlite.js [path/ke/noona.db]
 *
 * Catatan: salin dulu SEMUA file data/noona.db, noona.db-wal, noona.db-shm ke
 * folder yang sama kalau database lama kamu masih menyimpan data di file -wal.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");

let Database;
try {
  Database = require("better-sqlite3");
} catch {
  console.error("Jalankan dulu: npm install --no-save better-sqlite3");
  process.exit(1);
}

const { pool, run, get, initSchema, seedAll } = require("../db/connection");
const storage = require("../db/storage");

const dbPath = path.resolve(process.argv[2] || path.join(__dirname, "..", "data", "noona.db"));
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function toIso(sqliteDate) {
  // SQLite menyimpan "YYYY-MM-DD HH:MM:SS" (UTC) -> ISO agar dibaca benar oleh Postgres
  return sqliteDate ? `${String(sqliteDate).replace(" ", "T")}Z` : new Date().toISOString();
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`File database tidak ditemukan: ${dbPath}`);
    process.exit(1);
  }
  const lite = new Database(dbPath, { readonly: true });
  const publicDir = path.join(__dirname, "..", "public");

  // Buat tabel saja dulu (tanpa seed), supaya data LAMA yang diimpor lebih dulu —
  // termasuk password admin dan harga layanan yang pernah kamu ubah — tidak tertimpa seed default.
  await initSchema();
  await storage.ensureBucket();

  const counts = { users: 0, services: 0, products: 0, orders: 0, images: 0, skipped: 0 };

  // ----- users -----
  for (const u of lite.prepare("SELECT * FROM users").all()) {
    const n = await run(
      `INSERT INTO users (username, password_hash, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING`,
      [u.username, u.password_hash, toIso(u.created_at)]
    );
    n ? counts.users++ : counts.skipped++;
  }

  // ----- services (dilewati kalau sudah ada layanan dengan nama + kategori sama) -----
  for (const s of lite.prepare("SELECT * FROM services ORDER BY id").all()) {
    const exists = await get("SELECT 1 FROM services WHERE name = $1 AND category = $2", [
      s.name,
      s.category || "grooming",
    ]);
    if (exists) {
      counts.skipped++;
      continue;
    }
    await run(
      `INSERT INTO services (name, icon, description, category, tiers, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s.name,
        s.icon,
        s.description,
        s.category || "grooming",
        s.tiers || "[]",
        toIso(s.created_at),
        toIso(s.updated_at),
      ]
    );
    counts.services++;
  }

  // ----- products (+ foto) -----
  for (const p of lite.prepare("SELECT * FROM products ORDER BY id").all()) {
    const exists = await get("SELECT 1 FROM products WHERE sku = $1", [p.sku]);
    if (exists) {
      counts.skipped++;
      continue;
    }

    let imageUrl = null;
    if (p.image) {
      const local = path.join(publicDir, p.image.replace(/^\//, ""));
      const ext = path.extname(local).toLowerCase();
      if (fs.existsSync(local) && MIME[ext]) {
        imageUrl = await storage.uploadImage(
          `migrated-${path.basename(local)}`.replace(/[^\w.\-]/g, "_"),
          fs.readFileSync(local),
          MIME[ext]
        );
        counts.images++;
      } else {
        console.warn(`⚠️  Foto tidak ditemukan untuk "${p.name}": ${p.image} (produk tetap dipindah tanpa foto)`);
      }
    }

    await run(
      `INSERT INTO products (sku, name, category, icon, image, price, variants, available, status, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        p.sku, p.name, p.category, p.icon, imageUrl, p.price, p.variants || "[]",
        p.available, p.status, p.description, toIso(p.created_at), toIso(p.updated_at),
      ]
    );
    counts.products++;
  }

  // ----- orders -----
  for (const o of lite.prepare("SELECT * FROM orders ORDER BY id").all()) {
    const n = await run(
      `INSERT INTO orders (order_code, items_json, total, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (order_code) DO NOTHING`,
      [o.order_code, o.items_json, o.total, o.status, toIso(o.created_at), toIso(o.updated_at)]
    );
    n ? counts.orders++ : counts.skipped++;
  }

  // Setelah impor: isi seed default hanya untuk tabel yang masih kosong
  await seedAll();

  // Sinkronkan urutan id supaya data baru tidak bentrok dengan data hasil migrasi
  for (const t of ["users", "products", "services", "orders"]) {
    await pool.query(
      `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`
    );
  }

  console.log("\n✅ Migrasi selesai:", counts);
}

main()
  .catch((err) => {
    console.error("❌ Migrasi gagal:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
