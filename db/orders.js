const db = require("./connection");
const products = require("./products");

const VALID_STATUS = ["menunggu_pembayaran", "dibayar", "dibatalkan"];

function generateOrderCode() {
  const today = new Date();
  const ymd = today.toISOString().slice(2, 10).replace(/-/g, ""); // e.g. 260713
  for (let i = 0; i < 20; i++) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const code = `NOONA-${ymd}-${rand}`;
    const exists = db.prepare("SELECT 1 FROM orders WHERE order_code = ?").get(code);
    if (!exists) return code;
  }
  // fallback, praktis mustahil kepakai
  return `NOONA-${ymd}-${Date.now()}`;
}

function rowToOrder(row) {
  const { items_json, ...rest } = row;
  return { ...rest, items: JSON.parse(items_json) };
}

/**
 * Buat order baru dari keranjang belanja pelanggan.
 * PENTING: harga & nama produk diambil ulang dari database di sini (server-side),
 * bukan dipercaya begitu saja dari body request — supaya pelanggan tidak bisa
 * memanipulasi harga lewat DevTools/fetch manual.
 */
function create(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Keranjang kosong." };
  }

  const ids = items.map((it) => Number(it.productId)).filter(Boolean);
  const found = products.getByIds(ids);
  const byId = new Map(found.map((p) => [p.id, p]));

  const lineItems = [];
  for (const it of items) {
    const product = byId.get(Number(it.productId));
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    if (!product) {
      return { error: `Produk dengan id ${it.productId} tidak ditemukan.` };
    }

    let price = product.price;
    let variantLabel = null;

    if (product.variants && product.variants.length > 0) {
      // Produk ini punya varian -> pelanggan WAJIB pilih salah satu, dan harga
      // diambil dari data varian di database (bukan dari body request).
      const variant = product.variants.find((v) => v.label === it.variantLabel);
      if (!variant) {
        return { error: `Pilih varian yang valid untuk produk "${product.name}".` };
      }
      price = variant.price;
      variantLabel = variant.label;
    }

    lineItems.push({
      productId: product.id,
      name: product.name,
      variantLabel,
      price,
      qty,
      subtotal: price * qty,
    });
  }

  const total = lineItems.reduce((sum, li) => sum + li.subtotal, 0);
  const orderCode = generateOrderCode();

  db.prepare(
    `INSERT INTO orders (order_code, items_json, total, status) VALUES (?, ?, ?, 'menunggu_pembayaran')`
  ).run(orderCode, JSON.stringify(lineItems), total);

  return { order: getByCode(orderCode) };
}

function getByCode(orderCode) {
  const row = db.prepare("SELECT * FROM orders WHERE order_code = ?").get(orderCode);
  return row ? rowToOrder(row) : null;
}

function getById(id) {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(Number(id));
  return row ? rowToOrder(row) : null;
}

function getAll({ status, page = 1, limit = 15 } = {}) {
  const where = [];
  const params = {};
  if (status && status !== "semua") {
    where.push("status = @status");
    params.status = status;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = db.prepare(`SELECT COUNT(*) AS c FROM orders ${whereSql}`).get(params).c;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 15);
  const offset = (pageNum - 1) * limitNum;

  const rows = db
    .prepare(`SELECT * FROM orders ${whereSql} ORDER BY id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: limitNum, offset });

  return {
    items: rows.map(rowToOrder),
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.max(1, Math.ceil(total / limitNum)),
  };
}

function updateStatus(id, status) {
  if (!VALID_STATUS.includes(status)) return { error: "Status tidak valid." };
  const existing = getById(id);
  if (!existing) return { error: "Pesanan tidak ditemukan." };
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    Number(id)
  );
  return { order: getById(id) };
}

module.exports = { create, getByCode, getById, getAll, updateStatus, VALID_STATUS };
