const { pool, all, get, run } = require("./connection");

function statusFromAvailable(available) {
  return available ? "tersedia" : "habis";
}

function normalizeVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants
    .map((v) => ({ label: String(v.label || "").trim(), price: Number(v.price) || 0 }))
    .filter((v) => v.label.length > 0);
}

// Kolom JSONB `variants` sudah otomatis jadi array oleh driver pg; di sini cukup
// hitung "startingPrice" (harga varian termurah kalau ada varian, kalau tidak harga dasar).
function rowToProduct(row) {
  if (!row) return row;
  const variants = Array.isArray(row.variants) ? row.variants : [];
  const startingPrice = variants.length ? Math.min(...variants.map((v) => v.price)) : row.price;
  // images = semua foto (urutan pertama = sampul). "image" selalu disamakan dengan foto pertama.
  let images = Array.isArray(row.images) ? row.images.filter(Boolean) : [];
  if (!images.length && row.image) images = [row.image];
  return { ...row, images, image: images[0] || null, variants, startingPrice };
}

// Maks. foto per produk (dipakai juga oleh route upload).
const MAX_IMAGES = 5;

// Dari daftar URL kiriman admin, ambil hanya yang memang foto milik produk ini (urutan dari admin dipertahankan).
function normalizeImages(list, allowed) {
  if (!Array.isArray(list)) return allowed;
  return [...new Set(list.filter((u) => typeof u === "string" && allowed.includes(u)))];
}

const SORTS = {
  price_asc: "price ASC",
  price_desc: "price DESC",
  name_asc: "LOWER(name) ASC",
};

async function getAll({ search, category, status, sort, page = 1, limit = 12 } = {}) {
  const where = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    const p = `$${params.length}`;
    where.push(`(name ILIKE ${p} OR description ILIKE ${p} OR sku ILIKE ${p})`);
  }
  if (category && category !== "semua") {
    params.push(category);
    where.push(`category = $${params.length}`);
  }
  if (status && status !== "semua") {
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = SORTS[sort] ? `ORDER BY ${SORTS[sort]}` : "ORDER BY id DESC";

  const { c } = await get(`SELECT COUNT(*)::int AS c FROM products ${whereSql}`, params);

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 12);
  const offset = (pageNum - 1) * limitNum;

  const rows = await all(
    `SELECT * FROM products ${whereSql} ${orderSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limitNum, offset]
  );

  return {
    items: rows.map(rowToProduct),
    total: c,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.max(1, Math.ceil(c / limitNum)),
  };
}

async function getCategories() {
  const rows = await all("SELECT DISTINCT category FROM products ORDER BY category ASC");
  return rows.map((r) => r.category);
}

async function getById(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return undefined;
  return rowToProduct(await get("SELECT * FROM products WHERE id = $1", [n]));
}

async function getByIds(ids) {
  const clean = ids.map(Number).filter((n) => Number.isInteger(n));
  if (!clean.length) return [];
  const rows = await all("SELECT * FROM products WHERE id = ANY($1::int[])", [clean]);
  return rows.map(rowToProduct);
}

async function nextCustomSku() {
  const rows = await all("SELECT sku FROM products WHERE sku ~ '^NN-CUSTOM-[0-9]+$'");
  const used = new Set(rows.map((r) => parseInt(r.sku.slice("NN-CUSTOM-".length), 10)));
  let n = 1;
  while (used.has(n)) n++;
  return `NN-CUSTOM-${String(n).padStart(4, "0")}`;
}

async function create(product) {
  const available = product.available === false || product.available === 0 ? 0 : 1;
  const variants = normalizeVariants(product.variants);

  // id database tetap dari sequence (tidak pernah dipakai ulang, supaya aman).
  const { id } = await get("SELECT nextval(pg_get_serial_sequence('products', 'id'))::int AS id");
  // SKU otomatis = nomor kosong terkecil di antara NN-CUSTOM-xxxx yang masih ada, jadi
  // kalau 0002 dihapus produk berikutnya memakai 0002 lagi, dan kalau semua dihapus mulai lagi dari 0001.
  const sku = product.sku || (await nextCustomSku());

  await run(
    `INSERT INTO products (id, sku, name, category, icon, image, price, variants, available, status, description)
     VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10)`,
    [
      id,
      sku,
      product.name,
      product.category,
      product.icon || "🐾",
      Number(product.price) || 0,
      JSON.stringify(variants),
      available,
      statusFromAvailable(available),
      product.description || "",
    ]
  );
  return getById(id);
}

async function update(id, updates) {
  const existing = await getById(id);
  if (!existing) return null;

  const available =
    updates.available !== undefined ? (updates.available ? 1 : 0) : existing.available;

  const variants =
    updates.variants !== undefined ? normalizeVariants(updates.variants) : existing.variants;

  // Kalau admin mengirim "images", itu daftar foto yang DIPERTAHANKAN (yang tidak ada = dihapus).
  const images =
    updates.images !== undefined ? normalizeImages(updates.images, existing.images) : existing.images;

  await run(
    `UPDATE products SET
       sku=$1, name=$2, category=$3, icon=$4, price=$5, variants=$6,
       available=$7, status=$8, description=$9, images=$11, image=$12, updated_at=now()
     WHERE id=$10`,
    [
      updates.sku ?? existing.sku,
      updates.name ?? existing.name,
      updates.category ?? existing.category,
      updates.icon ?? existing.icon,
      updates.price !== undefined ? Number(updates.price) : existing.price,
      JSON.stringify(variants),
      available,
      statusFromAvailable(available),
      updates.description ?? existing.description,
      Number(id),
      JSON.stringify(images),
      images[0] || null,
    ]
  );

  return getById(id);
}

function updateAvailability(id, available) {
  return update(id, { available: !!available });
}

async function remove(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return false;
  return (await run("DELETE FROM products WHERE id = $1", [n])) > 0;
}

// Tambah satu/lebih foto ke akhir daftar. Foto pertama otomatis jadi sampul.
async function addImages(id, urls) {
  const existing = await getById(id);
  if (!existing) return null;
  const images = [...existing.images, ...urls];
  await run("UPDATE products SET images = $1, image = $2, updated_at = now() WHERE id = $3", [
    JSON.stringify(images),
    images[0] || null,
    Number(id),
  ]);
  return getById(id);
}

module.exports = {
  getAll,
  getCategories,
  getById,
  getByIds,
  create,
  update,
  updateAvailability,
  remove,
  addImages,
  MAX_IMAGES,
  statusFromAvailable,
};
