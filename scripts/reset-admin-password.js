/**
 * Reset password akun admin langsung di database.
 * Jalankan: node scripts/reset-admin-password.js password-baru-kamu
 *
 * Beda dengan scripts/hash-password.js (yang cuma mencetak hash untuk .env),
 * script ini LANGSUNG mengubah password_hash di tabel users pada
 * data/noona.db — karena setelah database ada isinya, .env hanya dipakai
 * untuk seed akun admin PERTAMA KALI, bukan untuk login setelah itu.
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const users = require("../db/users");

const newPassword = process.argv[2];
const username = process.env.ADMIN_USERNAME || "admin";

if (!newPassword) {
  console.error("Pemakaian: node scripts/reset-admin-password.js password-baru-kamu");
  process.exit(1);
}
if (newPassword.length < 6) {
  console.error("Password baru minimal 6 karakter.");
  process.exit(1);
}

const user = users.findByUsername(username);
if (!user) {
  console.error(
    `Akun "${username}" tidak ditemukan di database. Jalankan server sekali (npm start) dulu supaya akun awal ter-seed.`
  );
  process.exit(1);
}

const hash = bcrypt.hashSync(newPassword, 10);
users.updatePasswordHash(user.id, hash);

console.log(`✅ Password untuk akun "${username}" berhasil direset.`);
