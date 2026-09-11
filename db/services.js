const db = require("./connection");

function rowToService(row) {
  if (!row) return row;
  let tiers = [];
  try {
    tiers = JSON.parse(row.tiers);
  } catch {
    tiers = [];
  }
  const startingPrice = tiers.length ? Math.min(...tiers.map((t) => t.price)) : 0;
  return { ...row, tiers, startingPrice };
}

function getAll() {
  return db.prepare("SELECT * FROM services ORDER BY id ASC").all().map(rowToService);
}

function getById(id) {
  return rowToService(db.prepare("SELECT * FROM services WHERE id = ?").get(Number(id)));
}

function normalizeTiers(tiers) {
  if (!Array.isArray(tiers)) return [];
  return tiers
    .map((t) => ({ label: String(t.label || "").trim(), price: Number(t.price) || 0 }))
    .filter((t) => t.label.length > 0);
}

function create(service) {
  const tiers = normalizeTiers(service.tiers);
  const info = db
    .prepare(
      `INSERT INTO services (name, icon, description, tiers)
       VALUES (@name, @icon, @description, @tiers)`
    )
    .run({
      name: service.name,
      icon: service.icon || "🐾",
      description: service.description || "",
      tiers: JSON.stringify(tiers),
    });
  return getById(info.lastInsertRowid);
}

function update(id, updates) {
  const existing = db.prepare("SELECT * FROM services WHERE id = ?").get(Number(id));
  if (!existing) return null;

  const merged = {
    name: updates.name ?? existing.name,
    icon: updates.icon ?? existing.icon,
    description: updates.description ?? existing.description,
    tiers: JSON.stringify(
      updates.tiers !== undefined ? normalizeTiers(updates.tiers) : JSON.parse(existing.tiers)
    ),
  };

  db.prepare(
    `UPDATE services SET name=@name, icon=@icon, description=@description, tiers=@tiers,
       updated_at=datetime('now') WHERE id=@id`
  ).run({ ...merged, id: Number(id) });

  return getById(id);
}

function remove(id) {
  const info = db.prepare("DELETE FROM services WHERE id = ?").run(Number(id));
  return info.changes > 0;
}

module.exports = { getAll, getById, create, update, remove };
