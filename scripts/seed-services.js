/**
 * (Opsional — server sekarang mengisi ini otomatis sekali saat pertama jalan.)
 * Mengisi layanan yang belum ada di database (Grooming, Pet Care, Pet Hotel),
 * isinya dari db/services-seed-data.js. Layanan yang sudah ada (nama + kategori sama) dilewati,
 * jadi data yang sudah kamu edit lewat dashboard TIDAK ditimpa.
 *
 *   node scripts/seed-services.js              -> hanya menambah yang belum ada
 *   node scripts/seed-services.js --overwrite  -> juga mengembalikan teks/harga yang sudah ada ke bawaan
 */
require("dotenv").config();
const { get, run, pool } = require("../db/connection");
const { SERVICES } = require("../db/services-seed-data");

const overwrite = process.argv.includes("--overwrite");

(async () => {
  try {
    for (const s of SERVICES) {
      const existing = await get("SELECT id FROM services WHERE category = $1 AND name = $2", [s.category, s.name]);
      if (existing && !overwrite) {
        console.log(`⏭️  [${s.category}] "${s.name}" sudah ada, dilewati.`);
      } else if (existing) {
        await run(
          "UPDATE services SET icon=$1, description=$2, tiers=$3, updated_at=now() WHERE id=$4",
          [s.icon, s.description, JSON.stringify(s.tiers), existing.id]
        );
        console.log(`♻️  [${s.category}] "${s.name}" dikembalikan ke isi bawaan.`);
      } else {
        await run(
          "INSERT INTO services (name, icon, description, category, tiers) VALUES ($1, $2, $3, $4, $5)",
          [s.name, s.icon, s.description, s.category, JSON.stringify(s.tiers)]
        );
        console.log(`✅ [${s.category}] "${s.name}" ditambahkan.`);
      }
    }
  } catch (err) {
    console.error("Gagal:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
