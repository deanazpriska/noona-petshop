/**
 * Reset password akun admin langsung di database (Supabase).
 * Jalankan: node scripts/reset-admin-password.js password-baru-kamu
 *
 * Beda dengan scripts/hash-password.js (yang cuma mencetak hash untuk .env),
 * script ini LANGSUNG mengubah password_hash di tabel users — karena setelah
 * database ada isinya, .env hanya dipakai untuk seed akun admin PERTAMA KALI,
 * bukan untuk login setelah itu.
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool, initDatabase } = require("../db/connection");
const users = require("../db/users");

const newPassword = process.argv[2];
const username = process.env.ADMIN_USERNAME || "admin";

async function main() {
  if (!newPassword) {
    console.error("Pemakaian: node scripts/reset-admin-password.js password-baru-kamu");
    process.exit(1);
  }
  if (newPassword.length < 6) {
    console.error("Password baru minimal 6 karakter.");
    process.exit(1);
  }

  await initDatabase();
  const user = await users.findByUsername(username);
  if (!user) {
    console.error(`Akun "${username}" tidak ditemukan di database.`);
    process.exit(1);
  }

  await users.updatePasswordHash(user.id, bcrypt.hashSync(newPassword, 10));
  console.log(`✅ Password untuk akun "${username}" berhasil direset.`);
}

main()
  .catch((err) => {
    console.error("❌ Gagal:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
