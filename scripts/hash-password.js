/**
 * Utilitas untuk membuat hash bcrypt dari password admin.
 * Pakai ini setiap kali mau mengganti password admin.
 *
 * Cara pakai:
 *   node scripts/hash-password.js password-baru-kamu
 *
 * Lalu salin hasil hash ke file .env, pada variabel ADMIN_PASSWORD_HASH
 */
const bcrypt = require("bcryptjs");

const plain = process.argv[2];

if (!plain) {
  console.log("Pakai: node scripts/hash-password.js <password-baru>");
  process.exit(1);
}

const hash = bcrypt.hashSync(plain, 10);
console.log("\nTambahkan baris berikut ke file .env kamu:\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
