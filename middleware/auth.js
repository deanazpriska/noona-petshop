/**
 * Middleware route-protection untuk area admin.
 *
 * Cara kerja:
 * - Setelah login berhasil (lihat routes/auth.routes.js), server menyimpan
 *   req.session.isAdmin = true pada session milik browser tsb (session
 *   disimpan di server, browser hanya menyimpan cookie id session yang
 *   di-sign & httpOnly — tidak bisa dibaca/diubah lewat JS di browser).
 * - requireAuth mengecek session ini di setiap request ke halaman/API admin.
 * - Kalau belum login:
 *     - request ke /api/* dibalas 401 JSON (dipakai oleh fetch() di frontend)
 *     - request ke halaman HTML di-redirect ke /admin/login
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }

  if (req.originalUrl.startsWith("/api/")) {
    return res.status(401).json({ error: "Unauthorized. Silakan login terlebih dahulu." });
  }

  return res.redirect("/admin/login");
}

module.exports = { requireAuth };
