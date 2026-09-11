const express = require("express");
const router = express.Router();
const db = require("../db/services");
const { requireAuth } = require("../middleware/auth");

/**
 * PUBLIK — daftar layanan (Grooming, Pet Hotel, dst), read-only, tanpa login
 */

// GET /api/services
router.get("/", (req, res) => {
  res.json(db.getAll());
});

// GET /api/services/:id
router.get("/:id", (req, res) => {
  const service = db.getById(req.params.id);
  if (!service) return res.status(404).json({ error: "Layanan tidak ditemukan." });
  res.json(service);
});

/**
 * ADMIN ONLY — tambah/edit/hapus layanan
 */

// POST /api/services
router.post("/", requireAuth, (req, res) => {
  const { name, icon, description, tiers } = req.body || {};
  if (!name || !Array.isArray(tiers) || tiers.length === 0) {
    return res.status(400).json({ error: "name dan minimal 1 varian harga (tiers) wajib diisi." });
  }
  const service = db.create({ name, icon, description, tiers });
  res.status(201).json(service);
});

// PUT /api/services/:id
router.put("/:id", requireAuth, (req, res) => {
  const updated = db.update(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Layanan tidak ditemukan." });
  res.json(updated);
});

// DELETE /api/services/:id
router.delete("/:id", requireAuth, (req, res) => {
  const ok = db.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: "Layanan tidak ditemukan." });
  res.json({ message: "Layanan dihapus." });
});

module.exports = router;
