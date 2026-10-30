// Dashboard admin — halaman ini hanya bisa dimuat setelah lolos requireAuth di server
// (lihat server.js). Skrip ini menambahkan pengecekan sisi klien sebagai lapisan
// tambahan (defense-in-depth) dan untuk menampilkan username yang sedang login.

const state = { search: "", category: "semua", page: 1, limit: 10 };
const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");
const titleCase = (str) => String(str).replace(/\b\w/g, (c) => c.toUpperCase());
const SERVICE_CATEGORY_LABEL = { grooming: "Grooming", "pet-care": "Pet Care", "pet-hotel": "Pet Hotel" };

// ---------- auth guard (client-side, tambahan) ----------
async function checkAuth() {
  const res = await fetch("/api/auth/me");
  if (!res.ok) {
    window.location.href = "/admin/login";
    return;
  }
  const data = await res.json();
  document.getElementById("whoami").textContent = data.username;
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/admin/login";
});

// ---------- helper: fetch yang otomatis redirect ke login kalau session habis ----------
async function authFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("Unauthorized");
  }
  return res;
}

// ---------- categories ----------
// Daftar filter dibangun ulang dari kategori yang benar-benar dipakai produk saat ini,
// jadi ikut berubah setiap kali produk ditambah, diedit (ganti kategori), atau dihapus.
async function loadCategories() {
  const res = await fetch("/api/products/categories");
  const categories = await res.json();
  const select = document.getElementById("categorySelect");
  if (state.category !== "semua" && !categories.includes(state.category)) {
    state.category = "semua"; // kategori yang dipilih sudah tidak dipakai produk mana pun
  }
  select.innerHTML = '<option value="semua">Semua kategori</option>';
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = titleCase(cat);
    select.appendChild(opt);
  });
  select.value = state.category;
}

// ---------- products table ----------
async function loadProducts() {
  await loadCategories();
  const params = new URLSearchParams({
    search: state.search,
    category: state.category,
    page: state.page,
    limit: state.limit,
  });
  const res = await fetch("/api/products?" + params.toString());
  const data = await res.json();
  window.__items = data.items;
  renderTable(data.items);
  renderPagination(data);
  document.getElementById("totalInfo").textContent = `${data.total} produk total`;
}

function renderTable(items) {
  const tbody = document.getElementById("tableBody");
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--ink-soft);">Tidak ada produk yang cocok.</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map(
      (p) => `
    <tr>
      <td>
        <div class="prod-name-cell">
          ${p.image ? `<img class="prod-thumb" src="${p.image}" alt="">` : ""}
          <div class="txt"><b>${escapeHtml(p.name)}</b><span>${p.sku}</span></div>
        </div>
      </td>
      <td>${p.category}</td>
      <td class="vp-cell col-fit col-varian">${
        p.variants && p.variants.length
          ? p.variants.map((v) => `<div class="vp-line" title="${escapeHtml(v.label)}">${escapeHtml(v.label)}</div>`).join("")
          : `<span class="vp-empty">—</span>`
      }</td>
      <td class="vp-cell col-fit">${
        p.variants && p.variants.length
          ? p.variants.map((v) => `<div class="vp-line vp-price">${rupiah(v.price)}</div>`).join("")
          : rupiah(p.price)
      }</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="Edit" onclick="openEditModal(${p.id})">✏️</button>
          <button class="icon-btn danger" title="Hapus" onclick="deleteProduct(${p.id})">🗑️</button>
        </div>
      </td>
    </tr>`
    )
    .join("");
}

function renderPagination(data) {
  const el = document.getElementById("pagination");
  if (data.totalPages <= 1) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `
    <button id="prevPage" ${data.page <= 1 ? "disabled" : ""}>← Sebelumnya</button>
    <span>Halaman ${data.page} dari ${data.totalPages}</span>
    <button id="nextPage" ${data.page >= data.totalPages ? "disabled" : ""}>Berikutnya →</button>
  `;
  document.getElementById("prevPage")?.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    loadProducts();
  });
  document.getElementById("nextPage")?.addEventListener("click", () => {
    state.page += 1;
    loadProducts();
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- delete ----------
async function deleteProduct(id) {
  const item = (window.__items || []).find((x) => x.id === id);
  if (!confirm(`Hapus produk "${item?.name || id}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    const res = await authFetch(`/api/products/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error();
    showToast("Produk dihapus");
    loadProducts();
  } catch {
    showToast("Gagal menghapus produk");
  }
}

// ---------- add / edit modal ----------
const formModal = document.getElementById("formModal");
const productForm = document.getElementById("productForm");
const formError = document.getElementById("formError");
const imageGallery = document.getElementById("imageGallery");
const imageInput = document.getElementById("fImageInput");
const pickPhotoLabel = document.getElementById("pickPhotoLabel");

const MAX_PRODUCT_IMAGES = 5;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
let keptImages = []; // URL foto yang sudah tersimpan di server dan masih dipertahankan (urutan pertama = foto utama)
let pendingFiles = []; // foto baru yang sudah dipilih tapi belum diunggah: [{ file, preview }]

function renderGallery() {
  const items = [
    ...keptImages.map((url, i) => ({ src: url, kind: "kept", idx: i })),
    ...pendingFiles.map((f, i) => ({ src: f.preview, kind: "new", idx: i })),
  ];
  imageGallery.innerHTML = items.length
    ? items
        .map(
          (it, n) => `
    <div class="gallery-item">
      <img src="${it.src}" alt="Foto produk ${n + 1}">
      ${n === 0 ? `<span class="gallery-badge">Utama</span>` : ""}
      <button type="button" class="gallery-remove" data-kind="${it.kind}" data-idx="${it.idx}" title="Hapus foto" aria-label="Hapus foto ${n + 1}">✕</button>
    </div>`
        )
        .join("")
    : `<div class="gallery-empty">Belum ada foto</div>`;
  pickPhotoLabel.style.display = items.length >= MAX_PRODUCT_IMAGES ? "none" : "inline-block";
}

function resetImageState(existingImages = []) {
  pendingFiles.forEach((f) => URL.revokeObjectURL(f.preview));
  pendingFiles = [];
  keptImages = [...existingImages];
  imageInput.value = "";
  renderGallery();
}

// Dropdown kategori: kalau produk lama masih memakai kategori yang sudah tidak ada di daftar baru
// (mis. "makanan", "mainan", "kandang"), tampilkan sementara supaya tidak kosong dan bisa dipindah.
function prepareCategorySelect(current) {
  const sel = document.getElementById("fCategory");
  sel.querySelectorAll("option[data-legacy]").forEach((o) => o.remove());
  if (current && ![...sel.options].some((o) => o.value === current)) {
    const opt = document.createElement("option");
    opt.value = current;
    opt.textContent = `${titleCase(current)} (kategori lama)`;
    opt.dataset.legacy = "1";
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
}

function openAddModal() {
  document.getElementById("formTitle").textContent = "Tambah Produk";
  productForm.reset();
  document.getElementById("productId").value = "";
  variantsEditorEl.innerHTML = ""; // varian produk opsional -> kosong = mode harga tunggal
  syncPriceFieldWithVariants();
  formError.classList.remove("show");
  prepareCategorySelect(null);
  resetImageState();
  formModal.classList.add("open");
}

function openEditModal(id) {
  const p = (window.__items || []).find((x) => x.id === id);
  if (!p) return;
  document.getElementById("formTitle").textContent = "Edit Produk";
  document.getElementById("productId").value = p.id;
  document.getElementById("fName").value = p.name;
  prepareCategorySelect(p.category);
  document.getElementById("fPrice").value = p.price;
  document.getElementById("fSku").value = p.sku;
  document.getElementById("fDesc").value = p.description;
  variantEditor.reset(p.variants || [], false);
  syncPriceFieldWithVariants();
  formError.classList.remove("show");

  resetImageState(p.images && p.images.length ? p.images : p.image ? [p.image] : []);

  formModal.classList.add("open");
}

function closeFormModal() {
  formModal.classList.remove("open");
}

document.getElementById("openAddModal").addEventListener("click", openAddModal);
document.getElementById("cancelForm").addEventListener("click", closeFormModal);

// pilih foto (boleh banyak sekaligus) -> tampilkan preview lokal (baru diunggah saat form disimpan)
imageInput.addEventListener("change", () => {
  const files = [...imageInput.files];
  imageInput.value = "";
  for (const file of files) {
    if (keptImages.length + pendingFiles.length >= MAX_PRODUCT_IMAGES) {
      showToast(`Maksimal ${MAX_PRODUCT_IMAGES} foto per produk`);
      break;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast(`"${file.name}" lebih dari 3MB, dilewati`);
      continue;
    }
    pendingFiles.push({ file, preview: URL.createObjectURL(file) });
  }
  renderGallery();
});

// hapus satu foto dari daftar — baru berlaku di server setelah tombol Simpan ditekan
imageGallery.addEventListener("click", (e) => {
  const btn = e.target.closest(".gallery-remove");
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  if (btn.dataset.kind === "kept") {
    keptImages.splice(idx, 1);
  } else {
    const [removed] = pendingFiles.splice(idx, 1);
    if (removed) URL.revokeObjectURL(removed.preview);
  }
  renderGallery();
});

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.classList.remove("show");

  const id = document.getElementById("productId").value;
  const payload = {
    name: document.getElementById("fName").value.trim(),
    category: document.getElementById("fCategory").value,
    price: Number(document.getElementById("fPrice").value),
    sku: document.getElementById("fSku").value.trim() || undefined,
    description: document.getElementById("fDesc").value.trim(),
    variants: variantEditor.collectRows(),
  };
  if (id) payload.images = keptImages; // daftar foto lama yang dipertahankan (yang dihapus ikut terhapus di server)

  try {
    const res = await authFetch(id ? `/api/products/${id}` : "/api/products", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      formError.textContent = data.error || "Gagal menyimpan produk.";
      formError.classList.add("show");
      return;
    }

    // kalau ada foto baru yang dipilih, unggah sekarang menyusul produk yang baru dibuat/diupdate
    if (pendingFiles.length > 0) {
      const fd = new FormData();
      pendingFiles.forEach(({ file }) => fd.append("images", file));
      const uploadRes = await authFetch(`/api/products/${data.id}/images`, {
        method: "POST",
        body: fd, // jangan set Content-Type manual — browser yang atur boundary multipart
      });
      if (!uploadRes.ok) {
        let reason = "";
        try {
          reason = (await uploadRes.json()).error || "";
        } catch {
          /* abaikan */
        }
        showToast(`Produk tersimpan, tapi foto gagal diunggah${reason ? `: ${reason}` : ""}`);
      }
    }

    closeFormModal();
    showToast(id ? "Produk diperbarui ✓" : "Produk ditambahkan ✓");
    loadProducts();
  } catch {
    formError.textContent = "Tidak bisa menghubungi server.";
    formError.classList.add("show");
  }
});

// ---------- search / filter ----------
let searchTimeout;
document.getElementById("searchInput").addEventListener("input", (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.search = e.target.value;
    state.page = 1;
    loadProducts();
  }, 350);
});
document.getElementById("categorySelect").addEventListener("change", (e) => {
  state.category = e.target.value;
  state.page = 1;
  loadProducts();
});

// ---------- toast ----------
let toastTimeout;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove("show"), 1800);
}

// ---------- init ----------
checkAuth();
loadProducts();

// ============================================================
// TABS
// ============================================================
document.querySelectorAll(".admin-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "layanan") {
      loadServices();
      loadCategoryImages();
    }
    if (btn.dataset.tab === "pesanan") loadOrders();
  });
});

// cek pesanan menunggu konfirmasi secara berkala untuk badge notifikasi di tab
async function refreshPendingOrdersBadge() {
  try {
    const res = await authFetch("/api/orders?status=menunggu_pembayaran&limit=1");
    const data = await res.json();
    const badge = document.getElementById("pendingOrdersBadge");
    if (data.total > 0) {
      badge.textContent = data.total;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  } catch {
    /* diamkan — bukan fitur kritikal */
  }
}
refreshPendingOrdersBadge();
setInterval(refreshPendingOrdersBadge, 30000);

// ============================================================
// LAYANAN (services) — harga per varian (mis. per ukuran S/M/L)
// ============================================================
async function loadServices() {
  const res = await fetch("/api/services");
  const services = await res.json();
  window.__services = services;
  const tbody = document.getElementById("servicesTableBody");
  if (services.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--ink-soft);">Belum ada layanan.</td></tr>`;
    return;
  }
  tbody.innerHTML = services
    .map(
      (s) => `
    <tr>
      <td>
        <div class="prod-name-cell">
          <div class="txt"><b>${escapeHtml(s.name)}</b></div>
        </div>
      </td>
      <td>${SERVICE_CATEGORY_LABEL[s.category] || s.category}</td>
      <td class="order-items-cell">${escapeHtml(s.description)}</td>
      <td class="tier-list-cell">
        ${s.tiers.map((t) => `<div><span>${escapeHtml(t.label)}</span><b>${rupiah(t.price)}</b></div>`).join("")}
      </td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="Edit" onclick="openEditServiceModal(${s.id})">✏️</button>
          <button class="icon-btn danger" title="Hapus" onclick="deleteService(${s.id})">🗑️</button>
        </div>
      </td>
    </tr>`
    )
    .join("");
}

// ---------- gambar kartu kategori layanan (Grooming / Pet Care / Pet Hotel) ----------
function renderCategoryImages(images) {
  document.querySelectorAll(".cat-image-slot").forEach((slot) => {
    const url = images[slot.dataset.cat];
    slot.querySelector(".cat-image-preview").innerHTML = url
      ? `<img src="${url}" alt="">`
      : `<span>Belum ada gambar</span>`;
    slot.querySelector(".btn-remove-photo").style.display = url ? "inline-block" : "none";
  });
}

async function loadCategoryImages() {
  try {
    const res = await fetch("/api/services/category-images");
    renderCategoryImages(await res.json());
  } catch {
    /* diamkan — panel tetap tampil dengan status "Belum ada gambar" */
  }
}

const catImagesGrid = document.getElementById("catImagesGrid");

// pilih gambar -> langsung diunggah (tidak perlu tombol simpan)
catImagesGrid.addEventListener("change", async (e) => {
  const input = e.target;
  if (input.type !== "file" || !input.files[0]) return;
  const file = input.files[0];
  input.value = "";
  if (file.size > MAX_IMAGE_BYTES) {
    showToast("Ukuran gambar maksimal 3MB");
    return;
  }
  const category = input.closest(".cat-image-slot").dataset.cat;
  const fd = new FormData();
  fd.append("image", file);
  try {
    const res = await authFetch(`/api/services/category-images/${category}`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal mengunggah gambar");
    renderCategoryImages(data);
    showToast("Gambar kartu diperbarui ✓");
  } catch (err) {
    showToast(err.message || "Gagal mengunggah gambar");
  }
});

catImagesGrid.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-remove-photo");
  if (!btn) return;
  const category = btn.closest(".cat-image-slot").dataset.cat;
  try {
    const res = await authFetch(`/api/services/category-images/${category}`, { method: "DELETE" });
    if (!res.ok) throw new Error();
    renderCategoryImages(await res.json());
    showToast("Gambar kartu dihapus");
  } catch {
    showToast("Gagal menghapus gambar");
  }
});

const serviceFormModal = document.getElementById("serviceFormModal");
const serviceForm = document.getElementById("serviceForm");
const serviceFormError = document.getElementById("serviceFormError");

// ============================================================
// Editor baris "label + harga" yang generik — dipakai untuk varian
// harga layanan (tiersEditor) MAUPUN varian produk (variantsEditor).
// ============================================================
let tierRowSeq = 0;

function createTierRowEditor(container, placeholderText) {
  function addRow(label = "", price = "") {
    const rowId = `tier-${tierRowSeq++}`;
    const row = document.createElement("div");
    row.className = "tier-row";
    row.id = rowId;
    row.innerHTML = `
      <input type="text" placeholder="${placeholderText}" value="${escapeHtml(label)}" class="tier-label">
      <input type="number" placeholder="Harga" min="0" value="${price}" class="tier-price">
      <button type="button" class="tier-remove" title="Hapus varian">✕</button>
    `;
    row.querySelector(".tier-remove").addEventListener("click", () => row.remove());
    container.appendChild(row);
  }

  function collectRows() {
    return [...container.querySelectorAll(".tier-row")]
      .map((row) => ({
        label: row.querySelector(".tier-label").value.trim(),
        price: Number(row.querySelector(".tier-price").value) || 0,
      }))
      .filter((t) => t.label.length > 0);
  }

  function reset(rows, addBlankIfEmpty = true) {
    container.innerHTML = "";
    const data = rows && rows.length ? rows : addBlankIfEmpty ? [{ label: "", price: "" }] : [];
    data.forEach((t) => addRow(t.label, t.price));
  }

  return { addRow, collectRows, reset };
}

const tiersEditorEl = document.getElementById("tiersEditor");
const tierEditor = createTierRowEditor(tiersEditorEl, "Nama varian, misal: S (1-2.5 kg)");
document.getElementById("addTierBtn").addEventListener("click", () => tierEditor.addRow());

// ---------- varian produk (mis. 50 gram / 100 gram) ----------
const variantsEditorEl = document.getElementById("variantsEditor");
const variantEditor = createTierRowEditor(variantsEditorEl, "Nama varian, misal: 100 gram");
const fPriceInput = document.getElementById("fPrice");
const fPriceHint = document.getElementById("fPriceHint");

// Kalau produk punya minimal 1 varian, field "Harga" dasar tidak dipakai lagi
// (harga sepenuhnya ditentukan oleh varian) — jadi dinonaktifkan otomatis.
function syncPriceFieldWithVariants() {
  const hasVariants = variantEditor.collectRows().length > 0;
  fPriceInput.disabled = hasVariants;
  fPriceHint.style.display = hasVariants ? "block" : "none";
  fPriceInput.required = !hasVariants;
  if (hasVariants) fPriceInput.value = "";
}
document.getElementById("addVariantBtn").addEventListener("click", () => {
  variantEditor.addRow();
  syncPriceFieldWithVariants();
});
variantsEditorEl.addEventListener("input", syncPriceFieldWithVariants);
variantsEditorEl.addEventListener("click", (e) => {
  if (e.target.closest(".tier-remove")) setTimeout(syncPriceFieldWithVariants, 0);
});

function openAddServiceModal() {
  document.getElementById("serviceFormTitle").textContent = "Tambah Layanan";
  serviceForm.reset();
  document.getElementById("serviceId").value = "";
  document.getElementById("sCategory").value = "grooming";
  tierEditor.reset(); // mulai dengan 1 baris kosong biar jelas cara isinya
  serviceFormError.classList.remove("show");
  serviceFormModal.classList.add("open");
}

function openEditServiceModal(id) {
  const s = (window.__services || []).find((x) => x.id === id);
  if (!s) return;
  document.getElementById("serviceFormTitle").textContent = "Edit Layanan";
  document.getElementById("serviceId").value = s.id;
  document.getElementById("sName").value = s.name;
  document.getElementById("sCategory").value = s.category || "grooming";
  document.getElementById("sDesc").value = s.description;
  tierEditor.reset(s.tiers);
  serviceFormError.classList.remove("show");
  serviceFormModal.classList.add("open");
}

function closeServiceFormModal() {
  serviceFormModal.classList.remove("open");
}

document.getElementById("openAddServiceModal").addEventListener("click", openAddServiceModal);
document.getElementById("cancelServiceForm").addEventListener("click", closeServiceFormModal);

serviceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  serviceFormError.classList.remove("show");

  const id = document.getElementById("serviceId").value;
  const tiers = tierEditor.collectRows();
  // Boleh kosong (mis. layanan Pet Care yang harganya custom sesuai treatment) —
  // kalau kosong, di halaman publik cuma tampil nama + deskripsi + tombol Booking.

  const payload = {
    name: document.getElementById("sName").value.trim(),
    category: document.getElementById("sCategory").value,
    description: document.getElementById("sDesc").value.trim(),
    tiers,
  };

  try {
    const res = await authFetch(id ? `/api/services/${id}` : "/api/services", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      serviceFormError.textContent = data.error || "Gagal menyimpan layanan.";
      serviceFormError.classList.add("show");
      return;
    }
    closeServiceFormModal();
    showToast(id ? "Layanan diperbarui ✓" : "Layanan ditambahkan ✓");
    loadServices();
  } catch {
    serviceFormError.textContent = "Tidak bisa menghubungi server.";
    serviceFormError.classList.add("show");
  }
});

async function deleteService(id) {
  const item = (window.__services || []).find((x) => x.id === id);
  if (!confirm(`Hapus layanan "${item?.name || id}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    const res = await authFetch(`/api/services/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error();
    showToast("Layanan dihapus");
    loadServices();
  } catch {
    showToast("Gagal menghapus layanan");
  }
}

// ============================================================
// PESANAN (orders)
// ============================================================
const orderState = { status: "semua", page: 1, limit: 10 };
const orderStatusLabel = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  dibayar: "Telah Dibayar",
  dibatalkan: "Dibatalkan",
};

async function loadOrders() {
  const params = new URLSearchParams({
    status: orderState.status,
    page: orderState.page,
    limit: orderState.limit,
  });
  const res = await authFetch("/api/orders?" + params.toString());
  const data = await res.json();
  renderOrdersTable(data.items);
  renderOrdersPagination(data);
  document.getElementById("ordersTotalInfo").textContent = `${data.total} pesanan total`;
  refreshPendingOrdersBadge();
}

function renderOrdersTable(items) {
  const tbody = document.getElementById("ordersTableBody");
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--ink-soft);">Belum ada pesanan.</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map((o) => {
      const itemsHtml = o.items
        .map((li) => `<div class="item-line">${escapeHtml(li.name)}${li.variantLabel ? ` (${escapeHtml(li.variantLabel)})` : ""}</div>`)
        .join("");
      const qtyHtml = o.items
        .map(
          (li, idx) =>
            `<div class="item-line"><input type="number" class="qty-input" min="1" step="1" value="${li.qty}" data-original="${li.qty}" onchange="updateOrderItemQty(${o.id}, ${idx}, this)" onkeydown="if(event.key==='Enter')this.blur()" aria-label="Qty ${escapeHtml(li.name)}"></div>`
        )
        .join("");
      const deleteHtml = o.items
        .map(
          (li, idx) =>
            `<div class="item-line"><button class="icon-btn danger" title="Hapus item" onclick="deleteOrderItem(${o.id}, ${idx}, ${o.items.length})">🗑️</button></div>`
        )
        .join("");
      const time = new Date(o.created_at).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      return `
      <tr>
        <td><span class="order-code">${o.order_code}</span></td>
        <td class="order-items-cell">${itemsHtml}</td>
        <td class="order-qty-cell">${qtyHtml}</td>
        <td>${rupiah(o.total)}</td>
        <td>
          <select class="status-select" onchange="updateOrderStatus(${o.id}, this.value)">
            ${orderStatusOptionsHtml(o.status)}
          </select>
        </td>
        <td style="font-size:.76rem;color:var(--ink-soft);">${time}</td>
        <td>
          <div class="order-action-cell">
            <span class="badge status-${o.status}">${orderStatusLabel[o.status]}</span>
            <div class="order-delete-col">${deleteHtml}</div>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function orderStatusOptionsHtml(current) {
  return Object.entries(orderStatusLabel)
    .map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`)
    .join("");
}

async function updateOrderStatus(id, status) {
  try {
    const res = await authFetch(`/api/orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error();
    showToast("Status pesanan diperbarui ✓");
    loadOrders();
  } catch {
    showToast("Gagal memperbarui status pesanan");
  }
}

async function updateOrderItemQty(orderId, index, input) {
  const qty = Number(input.value);
  if (!Number.isInteger(qty) || qty < 1) {
    showToast("Jumlah minimal 1");
    input.value = input.dataset.original;
    return;
  }
  if (String(qty) === input.dataset.original) return;
  try {
    const res = await authFetch(`/api/orders/${orderId}/items/${index}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qty }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    showToast("Jumlah item diperbarui ✓");
    loadOrders();
  } catch (err) {
    showToast(err.message || "Gagal memperbarui jumlah item");
    input.value = input.dataset.original;
  }
}

async function deleteOrderItem(orderId, index, itemCount) {
  const msg =
    itemCount <= 1
      ? "Ini item terakhir di pesanan. Menghapusnya akan menghapus SELURUH pesanan. Lanjutkan?"
      : "Hapus item ini dari pesanan? Total pesanan akan dihitung ulang.";
  if (!confirm(msg)) return;
  try {
    const res = await authFetch(`/api/orders/${orderId}/items/${index}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    showToast(data.deletedOrder ? "Pesanan dihapus ✓" : "Item dihapus dari pesanan ✓");
    loadOrders();
  } catch (err) {
    showToast(err.message || "Gagal menghapus item");
  }
}

function renderOrdersPagination(data) {
  const el = document.getElementById("ordersPagination");
  if (data.totalPages <= 1) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `
    <button id="ordersPrevPage" ${data.page <= 1 ? "disabled" : ""}>← Sebelumnya</button>
    <span>Halaman ${data.page} dari ${data.totalPages}</span>
    <button id="ordersNextPage" ${data.page >= data.totalPages ? "disabled" : ""}>Berikutnya →</button>
  `;
  document.getElementById("ordersPrevPage")?.addEventListener("click", () => {
    orderState.page = Math.max(1, orderState.page - 1);
    loadOrders();
  });
  document.getElementById("ordersNextPage")?.addEventListener("click", () => {
    orderState.page += 1;
    loadOrders();
  });
}

document.getElementById("orderStatusChips").addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-chip");
  if (!btn) return;
  document.querySelectorAll("#orderStatusChips .filter-chip").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  orderState.status = btn.dataset.status;
  orderState.page = 1;
  loadOrders();
});

// ============================================================
// GANTI PASSWORD
// ============================================================
const passwordModal = document.getElementById("passwordModal");
const passwordForm = document.getElementById("passwordForm");
const passwordFormError = document.getElementById("passwordFormError");

document.getElementById("openPasswordModal").addEventListener("click", () => {
  passwordForm.reset();
  passwordFormError.classList.remove("show");
  passwordModal.classList.add("open");
});
document.getElementById("cancelPasswordForm").addEventListener("click", () => {
  passwordModal.classList.remove("open");
});

passwordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  passwordFormError.classList.remove("show");
  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;

  try {
    const res = await authFetch("/api/auth/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      passwordFormError.textContent = data.error || "Gagal mengganti password.";
      passwordFormError.classList.add("show");
      return;
    }
    passwordModal.classList.remove("open");
    showToast("Password berhasil diganti ✓");
  } catch {
    passwordFormError.textContent = "Tidak bisa menghubungi server.";
    passwordFormError.classList.add("show");
  }
});
