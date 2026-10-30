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
  limits: { fileSize: 3 * 1024 * 1024, files: db.MAX_IMAGES }, // maks 3MB per foto, maks 5 foto sekali kirim
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
    const existing = await db.getById(req.params.id);
    const updated = await db.update(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "Produk tidak ditemukan." });
    // Foto yang tadinya ada tapi tidak lagi ada di daftar -> hapus filenya dari Storage
    const dropped = (existing?.images || []).filter((u) => !updated.images.includes(u));
    await Promise.all(dropped.map((u) => storage.deleteByUrl(u)));
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
    await Promise.all((existing?.images || []).map((u) => storage.deleteByUrl(u))); // buang semua file fotonya juga
    res.json({ message: "Produk dihapus." });
  })
);

// POST /api/products/:id/images  (multipart/form-data, field: "images", boleh banyak file) — admin only
// Foto ditambahkan di belakang foto yang sudah ada. Foto pertama = foto utama (sampul).
// Menghapus foto dilakukan lewat PUT /api/products/:id dengan { images: [...URL yang dipertahankan] }.
router.post(
  "/:id/images",
  requireAuth,
  wrap(async (req, res) => {
    const existing = await db.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Produk tidak ditemukan." });

    // Jalankan multer manual supaya error upload (format/ukuran) dibalas 400 yang rapi
    const parseErr = await new Promise((resolve) => upload.array("images", db.MAX_IMAGES)(req, res, resolve));
    if (parseErr) {
      const message =
        parseErr.code === "LIMIT_FILE_SIZE"
          ? "Ukuran tiap foto maksimal 3MB."
          : parseErr.code === "LIMIT_UNEXPECTED_FILE" || parseErr.code === "LIMIT_FILE_COUNT"
          ? `Maksimal ${db.MAX_IMAGES} foto per produk.`
          : parseErr.message || "Gagal mengunggah foto.";
      return res.status(400).json({ error: message });
    }
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: "Tidak ada file foto yang dikirim." });
    }
    if (existing.images.length + files.length > db.MAX_IMAGES) {
      return res.status(400).json({
        error: `Maksimal ${db.MAX_IMAGES} foto per produk (sekarang sudah ada ${existing.images.length}).`,
      });
    }

    const uploaded = [];
    try {
      for (const [i, file] of files.entries()) {
        const ext = ALLOWED_MIME[file.mimetype] || path.extname(file.originalname) || "";
        const fileName = `product-${req.params.id}-${Date.now()}-${i}${ext}`;
        uploaded.push(await storage.uploadImage(fileName, file.buffer, file.mimetype));
      }
    } catch (err) {
      // satu foto gagal -> batalkan yang sudah terlanjur terunggah supaya tidak jadi file yatim
      await Promise.all(uploaded.map((u) => storage.deleteByUrl(u)));
      throw err;
    }

    res.json(await db.addImages(req.params.id, uploaded));
  })
);

module.exports = router;
