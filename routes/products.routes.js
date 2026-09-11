const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const db = require("../db/products");
const { requireAuth } = require("../middleware/auth");

/**
 * Upload foto produk asli.
 * Disimpan di public/uploads/products — otomatis ke-serve publik lewat
 * express.static(public) di server.js, karena foto produk memang harus
 * bisa dilihat pelanggan di katalog (read-only), bukan data rahasia.
 * Yang DIKUNCI di sini hanya proses UPLOAD-nya (lihat requireAuth di route).
 */
const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads", "products");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME[file.mimetype] || path.extname(file.originalname) || "";
    cb(null, `product-${req.params.id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // maks 3MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      return cb(new Error("Format file harus JPG, PNG, atau WEBP."));
    }
    cb(null, true);
  },
});

function deleteFileIfExists(publicPath) {
  if (!publicPath) return;
  const absolute = path.join(__dirname, "..", "public", publicPath.replace(/^\//, ""));
  fs.unlink(absolute, () => {}); // diamkan kalau file sudah tidak ada
}

/**
 * PUBLIK (read-only) — tidak butuh login sama sekali
 */

// GET /api/products?search=&category=&status=&sort=&page=&limit=
router.get("/", (req, res) => {
  const { search, category, status, sort, page, limit } = req.query;
  const result = db.getAll({ search, category, status, sort, page, limit });
  res.json(result);
});

// GET /api/products/categories — daftar kategori unik, buat dropdown filter
router.get("/categories", (req, res) => {
  res.json(db.getCategories());
});

// GET /api/products/:id
router.get("/:id", (req, res) => {
  const product = db.getById(req.params.id);
  if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });
  res.json(product);
});

/**
 * ADMIN ONLY (create/update/delete/stock) — diproteksi requireAuth
 */

// POST /api/products
router.post("/", requireAuth, (req, res) => {
  const { name, category, price, available, description, icon, sku, variants } = req.body || {};
  if (!name || !category || price === undefined) {
    return res.status(400).json({ error: "name, category, dan price wajib diisi." });
  }
  const product = db.create({ name, category, price, available, description, icon, sku, variants });
  res.status(201).json(product);
});

// PUT /api/products/:id
router.put("/:id", requireAuth, (req, res) => {
  const updated = db.update(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Produk tidak ditemukan." });
  res.json(updated);
});

// PATCH /api/products/:id/availability  { available: true|false }
router.patch("/:id/availability", requireAuth, (req, res) => {
  const { available } = req.body || {};
  if (typeof available !== "boolean") {
    return res.status(400).json({ error: "available (true/false) wajib diisi." });
  }
  const updated = db.updateAvailability(req.params.id, available);
  if (!updated) return res.status(404).json({ error: "Produk tidak ditemukan." });
  res.json(updated);
});

// DELETE /api/products/:id
router.delete("/:id", requireAuth, (req, res) => {
  const existing = db.getById(req.params.id);
  const ok = db.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: "Produk tidak ditemukan." });
  if (existing?.image) deleteFileIfExists(existing.image); // buang file fotonya juga
  res.json({ message: "Produk dihapus." });
});

// POST /api/products/:id/image  (multipart/form-data, field: "image") — admin only
router.post("/:id/image", requireAuth, (req, res) => {
  if (!db.getById(req.params.id)) {
    return res.status(404).json({ error: "Produk tidak ditemukan." });
  }
  upload.single("image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Gagal mengunggah foto." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Tidak ada file foto yang dikirim." });
    }
    const publicPath = `/uploads/products/${req.file.filename}`;
    const result = db.setImage(req.params.id, publicPath);
    if (result.previousImage && result.previousImage !== publicPath) {
      deleteFileIfExists(result.previousImage); // ganti foto lama -> hapus file lama
    }
    res.json(result.product);
  });
});

// DELETE /api/products/:id/image — hapus foto, kembali ke ikon — admin only
router.delete("/:id/image", requireAuth, (req, res) => {
  const result = db.removeImage(req.params.id);
  if (!result) return res.status(404).json({ error: "Produk tidak ditemukan." });
  deleteFileIfExists(result.previousImage);
  res.json(result.product);
});

module.exports = router;
