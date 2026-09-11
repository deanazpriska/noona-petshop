const express = require("express");
const router = express.Router();
const db = require("../db/orders");
const { requireAuth } = require("../middleware/auth");

/**
 * PUBLIK — pelanggan membuat pesanan dari keranjangnya (sebelum konfirmasi via WhatsApp).
 * Harga & nama produk dihitung ulang di server (lihat db/orders.js) — request ini
 * tidak butuh login karena memang aksi pelanggan biasa, bukan aksi admin.
 */

// POST /api/orders   body: { items: [{ productId, qty }] }
router.post("/", (req, res) => {
  const { items } = req.body || {};
  const result = db.create(items);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.order);
});

// GET /api/orders/:code — cek status pesanan lewat kode order (dipakai halaman publik, tanpa login)
router.get("/:code", (req, res) => {
  const order = db.getByCode(req.params.code);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  res.json(order);
});

/**
 * ADMIN ONLY — lihat & kelola semua pesanan yang masuk
 */

// GET /api/orders?status=&page=&limit=
router.get("/", requireAuth, (req, res) => {
  const { status, page, limit } = req.query;
  res.json(db.getAll({ status, page, limit }));
});

// PATCH /api/orders/:id/status   body: { status }
router.patch("/:id/status", requireAuth, (req, res) => {
  const { status } = req.body || {};
  const result = db.updateStatus(req.params.id, status);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.order);
});

module.exports = router;
