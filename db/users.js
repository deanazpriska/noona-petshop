const { get, run } = require("./connection");

function findByUsername(username) {
  return get("SELECT * FROM users WHERE username = $1", [username]);
}

function findById(id) {
  return get("SELECT * FROM users WHERE id = $1", [Number(id)]);
}

async function updatePasswordHash(id, passwordHash) {
  await run("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, Number(id)]);
  return findById(id);
}

module.exports = { findByUsername, findById, updatePasswordHash };
