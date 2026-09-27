const db = require("./connection");

function statusFromAvailable(available) {
  return available ? "tersedia" : "habis";
}

function nextSku() {
  const row = db.prepare("SELECT COUNT(*) AS c FROM products").get();
  return `NN-CUSTOM-${String(row.c + 1).padStart(4, "0")}`;
}

function normalizeVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants
    .map((v) => ({ label: String(v.label || "").trim(), price: Number(v.price) || 0 }))
    .filter((v) => v.label.length > 0);
}

// Parse the JSON `variants` column into a real array + compute a display "startingPrice"
// (lowest variant price when variants exist, otherwise the base price).
function rowToProduct(row) {
  if (!row) return row;
  let variants = [];
  try {
    variants = JSON.parse(row.variants || "[]");
  } catch {
    variants = [];
  }
  const startingPrice = variants.length ? Math.min(...variants.map((v) => v.price)) : row.price;
  return { ...row, variants, startingPrice };
}

const SORTS = {
  price_asc: "price ASC",
  price_desc: "price DESC",
  name_asc: "name COLLATE NOCASE ASC",
};

function getAll({ search, category, status, sort, page = 1, limit = 12 } = {}) {
  const where = [];
  const params = {};

  if (search) {
    where.push("(name LIKE @q OR description LIKE @q OR sku LIKE @q)");
    params.q = `%${search}%`;
  }
  if (category && category !== "semua") {
    where.push("category = @category");
    params.category = category;
  }
  if (status && status !== "semua") {
    where.push("status = @status");
    params.status = status;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = SORTS[sort] ? `ORDER BY ${SORTS[sort]}` : "ORDER BY id DESC";

  const total = db.prepare(`SELECT COUNT(*) AS c FROM products ${whereSql}`).get(params).c;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 12);
  const offset = (pageNum - 1) * limitNum;

  const items = db
    .prepare(`SELECT * FROM products ${whereSql} ${orderSql} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: limitNum, offset })
    .map(rowToProduct);

  return {
    items,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.max(1, Math.ceil(total / limitNum)),
  };
}

function getCategories() {
  return db
    .prepare("SELECT DISTINCT category FROM products ORDER BY category ASC")
    .all()
    .map((r) => r.category);
}

function getById(id) {
  return rowToProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(Number(id)));
}

function getByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db
    .prepare(`SELECT * FROM products WHERE id IN (${placeholders})`)
    .all(...ids)
    .map(rowToProduct);
}

function create(product) {
  const available = product.available === false || product.available === 0 ? 0 : 1;
  const sku = product.sku || nextSku();
  const variants = normalizeVariants(product.variants);
  const info = db
    .prepare(
      `INSERT INTO products (sku, name, category, icon, image, price, variants, available, status, description)
       VALUES (@sku, @name, @category, @icon, @image, @price, @variants, @available, @status, @description)`
    )
    .run({
      sku,
      name: product.name,
      category: product.category,
      icon: product.icon || "🐾",
      image: null,
      price: Number(product.price) || 0,
      variants: JSON.stringify(variants),
      available,
      status: statusFromAvailable(available),
      description: product.description || "",
    });
  return getById(info.lastInsertRowid);
}

function update(id, updates) {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(id));
  if (!existing) return null;

  const available =
    updates.available !== undefined ? (updates.available ? 1 : 0) : existing.available;

  const merged = {
    sku: updates.sku ?? existing.sku,
    name: updates.name ?? existing.name,
    category: updates.category ?? existing.category,
    icon: updates.icon ?? existing.icon,
    price: updates.price !== undefined ? Number(updates.price) : existing.price,
    variants: JSON.stringify(
      updates.variants !== undefined ? normalizeVariants(updates.variants) : JSON.parse(existing.variants || "[]")
    ),
    available,
    status: statusFromAvailable(available),
    description: updates.description ?? existing.description,
  };

  db.prepare(
    `UPDATE products SET
       sku=@sku, name=@name, category=@category, icon=@icon, price=@price, variants=@variants,
       available=@available, status=@status, description=@description, updated_at=datetime('now')
     WHERE id=@id`
  ).run({ ...merged, id: Number(id) });

  return getById(id);
}

function updateAvailability(id, available) {
  return update(id, { available: !!available });
}

function remove(id) {
  const info = db.prepare("DELETE FROM products WHERE id = ?").run(Number(id));
  return info.changes > 0;
}

function setImage(id, imagePath) {
  const existing = getById(id);
  if (!existing) return null;
  const previousImage = existing.image;
  db.prepare("UPDATE products SET image = ?, updated_at = datetime('now') WHERE id = ?").run(
    imagePath,
    Number(id)
  );
  return { product: getById(id), previousImage };
}

function removeImage(id) {
  const existing = getById(id);
  if (!existing) return null;
  const previousImage = existing.image;
  db.prepare("UPDATE products SET image = NULL, updated_at = datetime('now') WHERE id = ?").run(
    Number(id)
  );
  return { product: getById(id), previousImage };
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
  setImage,
  removeImage,
  statusFromAvailable,
};
