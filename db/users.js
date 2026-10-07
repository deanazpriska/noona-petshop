const db = require("./connection");

function findByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

function findById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id));
}

function updatePasswordHash(id, passwordHash) {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, Number(id));
  return findById(id);
}

module.exports = { findByUsername, findById, updatePasswordHash };
