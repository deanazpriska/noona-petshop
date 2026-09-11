const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const users = require("../db/users");
const { requireAuth } = require("../middleware/auth");

// Guard sederhana terhadap brute-force: batasi percobaan login per IP
const attempts = new Map(); // ip -> { count, firstAttemptAt }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 menit

function isRateLimited(ip) {
  const record = attempts.get(ip);
  if (!record) return false;
  const expired = Date.now() - record.firstAttemptAt > WINDOW_MS;
  if (expired) {
    attempts.delete(ip);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function registerFailedAttempt(ip) {
  const record = attempts.get(ip);
  if (!record || Date.now() - record.firstAttemptAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAttemptAt: Date.now() });
  } else {
    record.count += 1;
  }
}

function clearAttempts(ip) {
  attempts.delete(ip);
}

// POST /api/auth/login — memverifikasi ke tabel users di database (bukan .env langsung)
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip;

  if (isRateLimited(ip)) {
    return res.status(429).json({
      error: "Terlalu banyak percobaan login. Coba lagi dalam beberapa menit.",
    });
  }

  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }

  const user = users.findByUsername(username);
  const passwordMatch = user ? bcrypt.compareSync(password, user.password_hash) : false;

  if (!user || !passwordMatch) {
    registerFailedAttempt(ip);
    return res.status(401).json({ error: "Username atau password salah." });
  }

  clearAttempts(ip);

  // Regenerasi session id setelah login untuk mencegah session fixation
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Gagal membuat session." });
    req.session.isAdmin = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ message: "Login berhasil.", username: user.username });
  });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Gagal logout." });
    res.clearCookie("connect.sid");
    res.json({ message: "Logout berhasil." });
  });
});

// GET /api/auth/me — dipakai frontend admin utk cek status login saat halaman dimuat
router.get("/me", (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.json({ authenticated: true, username: req.session.username });
  }
  res.status(401).json({ authenticated: false });
});

// PUT /api/auth/password — ganti password akun admin yang sedang login
router.put("/password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Password lama dan password baru wajib diisi." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Password baru minimal 6 karakter." });
  }

  const user = users.findById(req.session.userId);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: "Password lama salah." });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  users.updatePasswordHash(user.id, newHash);
  res.json({ message: "Password berhasil diganti." });
});

module.exports = router;
