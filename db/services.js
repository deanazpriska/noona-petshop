const { all, get, run } = require("./connection");

const CATEGORIES = ["grooming", "pet-care", "pet-hotel"];

function normalizeCategory(category, fallback = "grooming") {
  return CATEGORIES.includes(category) ? category : fallback;
}

function rowToService(row) {
  if (!row) return row;
  const tiers = Array.isArray(row.tiers) ? row.tiers : [];
  const startingPrice = tiers.length ? Math.min(...tiers.map((t) => t.price)) : 0;
  return { ...row, tiers, startingPrice };
}

async function getAll(category) {
  if (category && CATEGORIES.includes(category)) {
    const rows = await all("SELECT * FROM services WHERE category = $1 ORDER BY id ASC", [category]);
    return rows.map(rowToService);
  }
  const rows = await all("SELECT * FROM services ORDER BY id ASC");
  return rows.map(rowToService);
}

async function getById(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return undefined;
  return rowToService(await get("SELECT * FROM services WHERE id = $1", [n]));
}

function normalizeTiers(tiers) {
  if (!Array.isArray(tiers)) return [];
  return tiers
    .map((t) => ({ label: String(t.label || "").trim(), price: Number(t.price) || 0 }))
    .filter((t) => t.label.length > 0);
}

async function create(service) {
  const row = await get(
    `INSERT INTO services (name, icon, description, category, tiers)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      service.name,
      service.icon || "🐾",
      service.description || "",
      normalizeCategory(service.category),
      JSON.stringify(normalizeTiers(service.tiers)),
    ]
  );
  return getById(row.id);
}

async function update(id, updates) {
  const existing = await getById(id);
  if (!existing) return null;

  const tiers = updates.tiers !== undefined ? normalizeTiers(updates.tiers) : existing.tiers;

  await run(
    `UPDATE services SET name=$1, icon=$2, description=$3, category=$4, tiers=$5, updated_at=now()
     WHERE id=$6`,
    [
      updates.name ?? existing.name,
      updates.icon ?? existing.icon,
      updates.description ?? existing.description,
      normalizeCategory(updates.category, existing.category),
      JSON.stringify(tiers),
      Number(id),
    ]
  );

  return getById(id);
}

async function remove(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return false;
  return (await run("DELETE FROM services WHERE id = $1", [n])) > 0;
}

module.exports = { getAll, getById, create, update, remove };
