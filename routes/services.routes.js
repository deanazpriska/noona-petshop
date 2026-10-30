const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");
const db = require("../db/services");
const storage = require("../db/storage");
const { requireAuth } = require("../middleware/auth");
const { wrap } = require("../middleware/async");

// Upload gambar kartu kategori layanan: ditampung di memori lalu dikirim ke Supabase Storage
// (sama seperti foto produk). Yang disimpan di database hanya URL publiknya.
const ALLOWED_MIME = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // maks 3MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) return cb(new Error("Format file harus JPG, PNG, atau WEBP."));
    cb(null, true);
  },
});

/**
 * PUBLIK — daftar layanan (Grooming, Pet Hotel, dst), read-only, tanpa login
 */

// GET /api/services  (opsional: ?category=grooming|pet-care|pet-hotel)
router.get(
  "/",
  wrap(async (req, res) => {
    res.json(await db.getAll(req.query.category));
  })
);

// GET /api/services/category-images — gambar kartu kategori { grooming: url|null, "pet-care": ..., "pet-hotel": ... }
// (harus di atas "/:id" supaya tidak dianggap id layanan)
router.get(
  "/category-images",
  wrap(async (req, res) => {
    res.json(await db.getCategoryImages());
  })
);

// GET /api/services/:id
router.get(
  "/:id",
  wrap(async (req, res) => {
    const service = await db.getById(req.params.id);
    if (!service) return res.status(404).json({ error: "Layanan tidak ditemukan." });
    res.json(service);
  })
);

/**
 * ADMIN ONLY — tambah/edit/hapus layanan
 */

// POST /api/services/category-images/:category  (multipart/form-data, field: "image") — ganti gambar kartu kategori
router.post(
  "/category-images/:category",
  requireAuth,
  wrap(async (req, res) => {
    const { category } = req.params;
    if (!db.CATEGORIES.includes(category)) {
      return res.status(404).json({ error: "Kategori layanan tidak dikenal." });
    }
    const parseErr = await new Promise((resolve) => upload.single("image")(req, res, resolve));
    if (parseErr) {
      const message =
        parseErr.code === "LIMIT_FILE_SIZE" ? "Ukuran foto maksimal 3MB." : parseErr.message || "Gagal mengunggah foto.";
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Tidak ada file foto yang dikirim." });

    const ext = ALLOWED_MIME[req.file.mimetype] || path.extname(req.file.originalname) || "";
    const fileName = `layanan-${category}-${Date.now()}${ext}`;
    const url = await storage.uploadImage(fileName, req.file.buffer, req.file.mimetype);
    const previous = await db.setCategoryImage(category, url);
    if (previous && previous !== url) await storage.deleteByUrl(previous); // ganti gambar -> buang file lama
    res.json(await db.getCategoryImages());
  })
);

// DELETE /api/services/category-images/:category — hapus gambar, kartu kembali memakai ikon emoji
router.delete(
  "/category-images/:category",
  requireAuth,
  wrap(async (req, res) => {
    const { category } = req.params;
    if (!db.CATEGORIES.includes(category)) {
      return res.status(404).json({ error: "Kategori layanan tidak dikenal." });
    }
    const previous = await db.removeCategoryImage(category);
    if (previous) await storage.deleteByUrl(previous);
    res.json(await db.getCategoryImages());
  })
);

// POST /api/services
router.post(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    const { name, icon, description, category, tiers } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: "Nama layanan wajib diisi." });
    }
    const service = await db.create({ name, icon, description, category, tiers: tiers || [] });
    res.status(201).json(service);
  })
);

// PUT /api/services/:id
router.put(
  "/:id",
  requireAuth,
  wrap(async (req, res) => {
    const updated = await db.update(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "Layanan tidak ditemukan." });
    res.json(updated);
  })
);

// DELETE /api/services/:id
router.delete(
  "/:id",
  requireAuth,
  wrap(async (req, res) => {
    const ok = await db.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: "Layanan tidak ditemukan." });
    res.json({ message: "Layanan dihapus." });
  })
);

module.exports = router;
