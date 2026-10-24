const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");
const db = require("../db/products");
const storage = require("../db/storage");
const { requireAuth } = require("../middleware/auth");
const { wrap } = require("../middleware/async");

/**
 * Upload foto produk asli.
 * File ditampung sementara di memori (bukan disk server), lalu langsung dikirim ke
 * Supabase Storage (bucket publik). Yang disimpan di database hanya URL publiknya,
 * jadi foto TIDAK hilang walaupun server restart / di-deploy ulang.
 * Foto memang harus bisa dilihat pelanggan di katalog (read-only), bukan data rahasia.
 * Yang DIKUNCI di sini hanya proses UPLOAD-nya (lihat requireAuth di route).
 */
const ALLOWED_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // maks 3MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      return cb(new Error("Format file harus JPG, PNG, atau WEBP."));
    }
    cb(null, true);
  },
});

/**
 * PUBLIK (read-only) — tidak butuh login sama sekali
 */

// GET /api/products?search=&category=&status=&sort=&page=&limit=
router.get(
  "/",
  wrap(async (req, res) => {
    const { search, category, status, sort, page, limit } = req.query;
    res.json(await db.getAll({ search, category, status, sort, page, limit }));
  })
);

// GET /api/products/categories — daftar kategori unik, buat dropdown filter
router.get(
  "/categories",
  wrap(async (req, res) => {
    res.json(await db.getCategories());
  })
);

// GET /api/products/:id
router.get(
  "/:id",
  wrap(async (req, res) => {
    const product = await db.getById(req.params.id);
    if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });
    res.json(product);
  })
);

/**
 * ADMIN ONLY (create/update/delete/stock) — diproteksi requireAuth
 */

// POST /api/products
router.post(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    const { name, category, price, available, description, icon, sku, variants } = req.body || {};
    if (!name || !category || price === undefined) {
      return res.status(400).json({ error: "name, category, dan price wajib diisi." });
    }
    const product = await db.create({
      name,
      category,
      price,
      available,
      description,
      icon,
      sku,
      variants,
    });
    res.status(201).json(product);
  })
);

// PUT /api/products/:id
router.put(
  "/:id",
  requireAuth,
  wrap(async (req, res) => {
    const updated = await db.update(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "Produk tidak ditemukan." });
    res.json(updated);
  })
);

// PATCH /api/products/:id/availability  { available: true|false }
router.patch(
  "/:id/availability",
  requireAuth,
  wrap(async (req, res) => {
    const { available } = req.body || {};
    if (typeof available !== "boolean") {
      return res.status(400).json({ error: "available (true/false) wajib diisi." });
    }
    const updated = await db.updateAvailability(req.params.id, available);
    if (!updated) return res.status(404).json({ error: "Produk tidak ditemukan." });
    res.json(updated);
  })
);

// DELETE /api/products/:id
router.delete(
  "/:id",
  requireAuth,
  wrap(async (req, res) => {
    const existing = await db.getById(req.params.id);
    const ok = await db.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: "Produk tidak ditemukan." });
    if (existing?.image) await storage.deleteByUrl(existing.image); // buang file fotonya juga
    res.json({ message: "Produk dihapus." });
  })
);

// POST /api/products/:id/image  (multipart/form-data, field: "image") — admin only
router.post(
  "/:id/image",
  requireAuth,
  wrap(async (req, res) => {
    if (!(await db.getById(req.params.id))) {
      return res.status(404).json({ error: "Produk tidak ditemukan." });
    }

    // Jalankan multer manual supaya error upload (format/ukuran) dibalas 400 yang rapi
    const parseErr = await new Promise((resolve) => upload.single("image")(req, res, resolve));
    if (parseErr) {
      const message =
        parseErr.code === "LIMIT_FILE_SIZE"
          ? "Ukuran foto maksimal 3MB."
          : parseErr.message || "Gagal mengunggah foto.";
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Tidak ada file foto yang dikirim." });
    }

    const ext = ALLOWED_MIME[req.file.mimetype] || path.extname(req.file.originalname) || "";
    const fileName = `product-${req.params.id}-${Date.now()}${ext}`;
    const publicUrl = await storage.uploadImage(fileName, req.file.buffer, req.file.mimetype);

    const result = await db.setImage(req.params.id, publicUrl);
    if (result.previousImage && result.previousImage !== publicUrl) {
      await storage.deleteByUrl(result.previousImage); // ganti foto lama -> hapus file lama
    }
    res.json(result.product);
  })
);

// DELETE /api/products/:id/image — hapus foto, kembali ke ikon — admin only
router.delete(
  "/:id/image",
  requireAuth,
  wrap(async (req, res) => {
    const result = await db.removeImage(req.params.id);
    if (!result) return res.status(404).json({ error: "Produk tidak ditemukan." });
    await storage.deleteByUrl(result.previousImage);
    res.json(result.product);
  })
);

module.exports = router;
