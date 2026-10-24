const { all, get, run } = require("./connection");
const products = require("./products");

const VALID_STATUS = ["menunggu_pembayaran", "dibayar", "dibatalkan"];

async function generateOrderCode() {
  const today = new Date();
  const ymd = today.toISOString().slice(2, 10).replace(/-/g, ""); // e.g. 260713
  for (let i = 0; i < 20; i++) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const code = `NOONA-${ymd}-${rand}`;
    const exists = await get("SELECT 1 FROM orders WHERE order_code = $1", [code]);
    if (!exists) return code;
  }
  // fallback, praktis mustahil kepakai
  return `NOONA-${ymd}-${Date.now()}`;
}

function rowToOrder(row) {
  const { items_json, ...rest } = row;
  return { ...rest, items: Array.isArray(items_json) ? items_json : [] };
}

/**
 * Buat order baru dari keranjang belanja pelanggan.
 * PENTING: harga & nama produk diambil ulang dari database di sini (server-side),
 * bukan dipercaya begitu saja dari body request — supaya pelanggan tidak bisa
 * memanipulasi harga lewat DevTools/fetch manual.
 */
async function create(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Keranjang kosong." };
  }

  const ids = items.map((it) => Number(it.productId)).filter(Boolean);
  const found = await products.getByIds(ids);
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
  const orderCode = await generateOrderCode();

  await run(
    `INSERT INTO orders (order_code, items_json, total, status) VALUES ($1, $2, $3, 'menunggu_pembayaran')`,
    [orderCode, JSON.stringify(lineItems), total]
  );

  return { order: await getByCode(orderCode) };
}

async function getByCode(orderCode) {
  const row = await get("SELECT * FROM orders WHERE order_code = $1", [orderCode]);
  return row ? rowToOrder(row) : null;
}

async function getById(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return null;
  const row = await get("SELECT * FROM orders WHERE id = $1", [n]);
  return row ? rowToOrder(row) : null;
}

async function getAll({ status, page = 1, limit = 15 } = {}) {
  const where = [];
  const params = [];
  if (status && status !== "semua") {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { c } = await get(`SELECT COUNT(*)::int AS c FROM orders ${whereSql}`, params);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 15);
  const offset = (pageNum - 1) * limitNum;

  const rows = await all(
    `SELECT * FROM orders ${whereSql} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limitNum, offset]
  );

  return {
    items: rows.map(rowToOrder),
    total: c,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.max(1, Math.ceil(c / limitNum)),
  };
}

async function updateStatus(id, status) {
  if (!VALID_STATUS.includes(status)) return { error: "Status tidak valid." };
  const existing = await getById(id);
  if (!existing) return { error: "Pesanan tidak ditemukan." };
  await run("UPDATE orders SET status = $1, updated_at = now() WHERE id = $2", [
    status,
    Number(id),
  ]);
  return { order: await getById(id) };
}

/**
 * Ubah jumlah (qty) satu item di dalam pesanan. Subtotal & total dihitung ulang
 * di server dari harga yang sudah tersimpan di item tersebut.
 */
async function updateItemQty(id, index, qty) {
  const order = await getById(id);
  if (!order) return { error: "Pesanan tidak ditemukan." };

  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= order.items.length) {
    return { error: "Item tidak ditemukan." };
  }
  const n = Number(qty);
  if (!Number.isInteger(n) || n < 1) {
    return { error: "Jumlah harus bilangan bulat minimal 1." };
  }

  const items = order.items.map((li, idx) =>
    idx === i ? { ...li, qty: n, subtotal: li.price * n } : li
  );
  const total = items.reduce((sum, li) => sum + li.subtotal, 0);

  await run(
    "UPDATE orders SET items_json = $1, total = $2, updated_at = now() WHERE id = $3",
    [JSON.stringify(items), total, order.id]
  );
  return { order: await getById(id) };
}

/**
 * Hapus satu item dari pesanan. Kalau itu item terakhir, seluruh pesanan ikut dihapus
 * (frontend sudah meminta konfirmasi sebelumnya).
 */
async function removeItem(id, index) {
  const order = await getById(id);
  if (!order) return { error: "Pesanan tidak ditemukan." };

  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= order.items.length) {
    return { error: "Item tidak ditemukan." };
  }
  if (order.items.length === 1) {
    await run("DELETE FROM orders WHERE id = $1", [order.id]);
    return { deletedOrder: true };
  }

  const items = order.items.filter((_, idx) => idx !== i);
  const total = items.reduce((sum, li) => sum + li.subtotal, 0);

  await run(
    "UPDATE orders SET items_json = $1, total = $2, updated_at = now() WHERE id = $3",
    [JSON.stringify(items), total, order.id]
  );
  return { order: await getById(id) };
}

module.exports = {
  create,
  getByCode,
  getById,
  getAll,
  updateStatus,
  updateItemQty,
  removeItem,
  VALID_STATUS,
};
