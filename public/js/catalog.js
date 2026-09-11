// Katalog publik — read-only untuk data produk/layanan (tidak butuh login).
// Keranjang & checkout di file ini murni aksi PELANGGAN: order dibuat lewat
// POST /api/orders (publik), lalu dikonfirmasi manual oleh pelanggan sendiri
// via WhatsApp. Tidak ada endpoint admin yang dipanggil dari sini.

const state = {
  search: "",
  category: "semua",
  status: "semua",
  sort: "",
  page: 1,
  limit: 12,
};

let WA_NUMBER = "";
const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");
const statusLabel = { tersedia: "Tersedia", habis: "Habis" };

// ---------- config ----------
async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    const data = await res.json();
    WA_NUMBER = data.waNumber || "";
  } catch {
    WA_NUMBER = "";
  }
  const fab = document.getElementById("waDirectFab");
  if (fab) fab.href = waLink("Halo Noona, saya mau tanya-tanya");
}
function waLink(msg) {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
}

// ---------- layanan ----------
async function loadServices() {
  const res = await fetch("/api/services");
  const services = await res.json();
  const grid = document.getElementById("servicesGrid");
  grid.innerHTML = services
    .map(
      (s) => `
    <div class="ticket">
      <div class="ticket-top">
        <div class="ticket-icon">${s.icon}</div>
        <h3>${escapeHtml(s.name)}</h3>
        <p>${escapeHtml(s.description)}</p>
        <div class="tier-price-list">
          ${s.tiers.map((t) => `<div class="tier-price-row"><span>${escapeHtml(t.label)}</span><b>${rupiah(t.price)}</b></div>`).join("")}
        </div>
      </div>
      <div class="ticket-perf"></div>
      <div class="ticket-bottom">
        <span class="price">mulai ${rupiah(s.startingPrice)}</span>
        <a href="#" class="mini-link js-wa-open" data-msg="Halo Noona, saya mau booking ${escapeHtml(s.name)}">Booking →</a>
      </div>
    </div>`
    )
    .join("");
  wireWaOpenLinks();
}

// ---------- kategori & produk ----------
async function loadCategories() {
  const res = await fetch("/api/products/categories");
  const categories = await res.json();
  const select = document.getElementById("categorySelect");
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    select.appendChild(opt);
  });
}

async function loadProducts() {
  const params = new URLSearchParams({
    search: state.search,
    category: state.category,
    status: state.status,
    sort: state.sort,
    page: state.page,
    limit: state.limit,
  });
  const res = await fetch("/api/products?" + params.toString());
  const data = await res.json();
  renderProducts(data.items);
  renderPagination(data);
  document.getElementById("resultCount").textContent = `${data.total} produk ditemukan`;
  window.__lastItems = data.items;
  cacheProducts(data.items);
}

function renderProducts(items) {
  const grid = document.getElementById("productsGrid");
  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="emoji">🔍</div>Tidak ada produk yang cocok.<br>Coba kata kunci atau filter lain.</div>`;
    return;
  }
  grid.innerHTML = items
    .map((p) => {
      const hasVariants = p.variants && p.variants.length > 0;
      const priceLabel = hasVariants ? `mulai ${rupiah(p.startingPrice)}` : rupiah(p.price);
      const btnLabel = p.status === "habis" ? "Habis" : "Pilih Produk";
      return `
    <div class="pcard">
      <div class="pcard-art" onclick="openDetail(${p.id})">
        <span class="pcard-cat">${p.category}</span>
        <span class="pcard-status status-${p.status}">${statusLabel[p.status]}</span>
        ${p.image ? `<img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy">` : p.icon}
      </div>
      <div class="pcard-body">
        <h4 onclick="openDetail(${p.id})" style="cursor:pointer;">${escapeHtml(p.name)}</h4>
        <div class="pcard-foot">
          <span class="price-tag">${priceLabel}</span>
          <button class="add-btn" ${p.status === "habis" ? "disabled" : ""} onclick="openDetail(${p.id})">${btnLabel}</button>
        </div>
      </div>
    </div>`;
    })
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
    window.scrollTo({ top: document.getElementById("produk").offsetTop - 20, behavior: "smooth" });
  });
  document.getElementById("nextPage")?.addEventListener("click", () => {
    state.page += 1;
    loadProducts();
    window.scrollTo({ top: document.getElementById("produk").offsetTop - 20, behavior: "smooth" });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- detail modal ----------
const overlay = document.getElementById("overlay");
const pdetailModal = document.getElementById("pdetailModal");
let activeDetailId = null;
let activeDetailVariant = null; // label varian yang sedang dipilih, null = produk tanpa varian

function openDetail(id) {
  const p = (window.__lastItems || []).find((x) => x.id === id);
  if (!p) return;
  activeDetailId = id;
  document.getElementById("pdetailCat").textContent = p.category;
  const iconEl = document.getElementById("pdetailIcon");
  iconEl.innerHTML = p.image ? `<img src="${p.image}" alt="${escapeHtml(p.name)}">` : p.icon;
  document.getElementById("pdetailName").textContent = p.name;
  document.getElementById("pdetailDesc").textContent = p.description;
  const statusEl = document.getElementById("pdetailStatus");
  statusEl.textContent = statusLabel[p.status];
  statusEl.className = "pcard-status status-" + p.status;
  statusEl.style.position = "static";

  const variantBox = document.getElementById("pdetailVariants");
  const addBtn = document.getElementById("pdetailAddCart");

  if (p.variants && p.variants.length > 0) {
    activeDetailVariant = p.variants[0].label;
    variantBox.style.display = "flex";
    variantBox.innerHTML = p.variants
      .map(
        (v) => `
      <button type="button" class="variant-pill ${v.label === activeDetailVariant ? "active" : ""}" data-label="${escapeHtml(v.label)}" onclick="selectDetailVariant('${encodeURIComponent(v.label)}')">
        ${escapeHtml(v.label)}
      </button>`
      )
      .join("");
    document.getElementById("pdetailPrice").textContent = rupiah(p.variants[0].price);
  } else {
    activeDetailVariant = null;
    variantBox.style.display = "none";
    variantBox.innerHTML = "";
    document.getElementById("pdetailPrice").textContent = rupiah(p.price);
  }
  addBtn.style.display = "block";
  addBtn.disabled = p.status === "habis";
  addBtn.textContent = p.status === "habis" ? "Stok habis" : "+ Tambah ke Keranjang";

  overlay.classList.add("open");
  pdetailModal.classList.add("open");
}

function selectDetailVariant(encodedLabel) {
  const label = decodeURIComponent(encodedLabel);
  const p = (window.__lastItems || []).find((x) => x.id === activeDetailId);
  if (!p) return;
  const variant = p.variants.find((v) => v.label === label);
  if (!variant) return;
  activeDetailVariant = label;
  document.getElementById("pdetailPrice").textContent = rupiah(variant.price);
  document.querySelectorAll("#pdetailVariants .variant-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.label === label);
  });
}

function closeDetail() {
  overlay.classList.remove("open");
  pdetailModal.classList.remove("open");
  activeDetailId = null;
  activeDetailVariant = null;
}
document.getElementById("closeDetail").onclick = closeDetail;
document.getElementById("pdetailAddCart").onclick = () => {
  if (activeDetailId) addToCart(activeDetailId, activeDetailVariant);
  closeDetail();
};

// ============================================================
// KERANJANG — disimpan di localStorage supaya tidak hilang kalau
// halaman di-refresh. Ini aplikasi berjalan normal di browser sendiri
// (bukan pratinjau artifact), jadi localStorage aman dipakai di sini.
// ============================================================
const CART_KEY = "noona_cart_v1";

function makeCartKey(productId, variantLabel) {
  return `${productId}::${variantLabel || ""}`;
}
function parseCartKey(key) {
  const idx = key.indexOf("::");
  return { productId: Number(key.slice(0, idx)), variantLabel: key.slice(idx + 2) || null };
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch {
    return {};
  }
}
function saveCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    /* localStorage tidak tersedia (mis. private mode) — keranjang tetap jalan di memori tab ini saja */
  }
}
let cart = loadCart(); // "productId::variantLabel" -> qty

function cartCountTotal() {
  return Object.values(cart).reduce((a, b) => a + b, 0);
}

async function addToCart(id, variantLabel = null) {
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) return; // id tidak valid — jangan dimasukkan ke keranjang
  const key = makeCartKey(numId, variantLabel);
  cart[key] = (cart[key] || 0) + 1;
  saveCart(cart);
  updateCartBadge();
  renderDrawer();
  showToast("Ditambahkan ke keranjang 🛍️");
}
function changeQty(key, delta) {
  cart[key] = (cart[key] || 0) + delta;
  if (cart[key] <= 0) delete cart[key];
  saveCart(cart);
  updateCartBadge();
  renderDrawer();
}
function removeFromCart(key) {
  delete cart[key];
  saveCart(cart);
  updateCartBadge();
  renderDrawer();
  showToast("Produk dihapus dari keranjang");
}
function clearCart() {
  cart = {};
  saveCart(cart);
  updateCartBadge();
  renderDrawer();
  showToast("Keranjang dikosongkan");
}
document.getElementById("clearCartBtn")?.addEventListener("click", () => {
  if (Object.keys(cart).length === 0) return;
  if (confirm("Kosongkan semua isi keranjang?")) clearCart();
});
function updateCartBadge() {
  document.getElementById("cartCount").textContent = cartCountTotal();
}

// ---------- drawer ----------
const drawer = document.getElementById("drawer");
function openDrawer() {
  renderDrawer();
  drawer.classList.add("open");
  overlay.classList.add("open");
}
function closeDrawerFn() {
  drawer.classList.remove("open");
  overlay.classList.remove("open");
}
document.getElementById("openCart").onclick = openDrawer;
document.getElementById("closeDrawer").onclick = closeDrawerFn;
overlay.addEventListener("click", () => {
  closeDrawerFn();
  closeDetail();
  closeQrisFn();
});

// ---------- Tentang Kami: jam buka (otomatis sesuai hari ini) ----------
function renderHoursList() {
  const days = [
    { name: "Senin", open: true },
    { name: "Selasa", open: true },
    { name: "Rabu", open: true },
    { name: "Kamis", open: false },
    { name: "Jumat", open: true },
    { name: "Sabtu", open: true },
    { name: "Minggu", open: true },
  ];
  // getDay(): 0=Minggu, 1=Senin, ... 6=Sabtu -> geser supaya index 0 = Senin
  const todayIndex = (new Date().getDay() + 6) % 7;

  const list = document.getElementById("hoursList");
  list.innerHTML = days
    .map((d, i) => {
      const isToday = i === todayIndex;
      const rowClasses = ["hrow", isToday ? "today" : "", !d.open ? "closed" : ""].filter(Boolean).join(" ");
      const timeHtml = d.open
        ? `<span class="line-main"><b>Pet Shop &amp; Klinik</b> 09.00 – 21.00</span><span class="line-sub"><b>Grooming</b> 09.00 – 16.00</span>`
        : `Tutup`;
      return `<div class="${rowClasses}"><span class="day">${d.name}</span><span class="time">${timeHtml}</span></div>`;
    })
    .join("");
}

// Karena harga produk hanya lengkap tersedia di halaman "Produk" (yang sudah pernah
// dimuat lewat loadProducts / openDetail), kita simpan cache ringan berisi semua
// produk yang pernah terlihat supaya keranjang bisa menampilkan nama & harga terbaru.
const productCache = new Map();
function cacheProducts(items) {
  items.forEach((p) => productCache.set(p.id, p));
}

// Kalau produk yang ada di keranjang ternyata sudah dihapus/tidak ada lagi di
// database (misal admin hapus produknya, atau database di-reset), entri lama
// itu dibuang otomatis dari keranjang di sini — supaya badge jumlah keranjang
// dan proses checkout selalu sinkron dengan isi yang benar-benar valid.
async function pruneStaleCartEntries() {
  const rawKeys = Object.keys(cart);
  let removedCount = 0;

  // Langkah 1: buang key yang formatnya jelas rusak (bukan "productId::varian" yang valid)
  // tanpa perlu tanya ke server dulu.
  const validKeys = [];
  rawKeys.forEach((key) => {
    const { productId } = parseCartKey(key);
    if (!Number.isInteger(productId) || productId <= 0) {
      delete cart[key];
      removedCount++;
    } else {
      validKeys.push(key);
    }
  });

  // Langkah 2: dari key yang valid formatnya, cek satu-satu apakah produknya
  // masih ada di database (mungkin sudah dihapus admin / direset).
  const productIds = [...new Set(validKeys.map((k) => parseCartKey(k).productId))];
  const uncachedIds = productIds.filter((id) => !productCache.has(id));
  if (uncachedIds.length > 0) {
    const results = await Promise.all(
      uncachedIds.map(async (id) => {
        try {
          const res = await fetch(`/api/products/${id}`);
          return { id, product: res.ok ? await res.json() : null };
        } catch {
          return { id, product: null };
        }
      })
    );
    results.forEach(({ id, product }) => {
      if (product) productCache.set(id, product);
    });
  }

  validKeys.forEach((key) => {
    const { productId, variantLabel } = parseCartKey(key);
    const p = productCache.get(productId);
    if (!p) {
      delete cart[key];
      removedCount++;
      return;
    }
    // Kalau produk punya varian tapi varian di keranjang sudah tidak ada lagi
    // (mis. admin hapus/ganti nama varian itu), baris ini juga dianggap basi.
    if (p.variants && p.variants.length > 0 && variantLabel && !p.variants.some((v) => v.label === variantLabel)) {
      delete cart[key];
      removedCount++;
    }
  });

  if (removedCount > 0) {
    saveCart(cart);
    updateCartBadge();
    showToast(
      removedCount === 1
        ? "1 produk di keranjang sudah tidak tersedia dan dihapus otomatis"
        : `${removedCount} produk di keranjang sudah tidak tersedia dan dihapus otomatis`
    );
  }
}

async function renderDrawer() {
  await pruneStaleCartEntries();
  const itemsEl = document.getElementById("drawerItems");
  const entries = Object.entries(cart);

  if (entries.length === 0) {
    itemsEl.innerHTML = `<div class="empty-cart">Keranjang masih kosong.<br>Yuk mulai belanja untuk si bulu 🐾</div>`;
    document.getElementById("totalAmount").textContent = rupiah(0);
    return;
  }

  let total = 0;
  itemsEl.innerHTML = entries
    .map(([key, qty]) => {
      const { productId, variantLabel } = parseCartKey(key);
      const p = productCache.get(productId);
      if (!p) return "";
      let price = p.price;
      if (variantLabel && p.variants) {
        const variant = p.variants.find((v) => v.label === variantLabel);
        if (variant) price = variant.price;
      }
      total += price * qty;
      return `
        <div class="cart-row">
          <div class="art">${p.image ? `<img src="${p.image}" alt="">` : p.icon}</div>
          <div class="info">
            <b>${escapeHtml(p.name)}</b>
            ${variantLabel ? `<span class="variant-tag">${escapeHtml(variantLabel)}</span>` : ""}
            <span class="line-price">${rupiah(price)}</span>
          </div>
          <div class="qty">
            <button onclick="changeQty('${key}',-1)" aria-label="Kurangi" ${qty <= 1 ? "disabled" : ""}>–</button>
            <span>${qty}</span>
            <button onclick="changeQty('${key}',1)" aria-label="Tambah">+</button>
          </div>
          <button class="cart-remove-btn" onclick="removeFromCart('${key}')" aria-label="Hapus produk" title="Hapus dari keranjang">🗑️</button>
        </div>`;
    })
    .join("");
  document.getElementById("totalAmount").textContent = rupiah(total);
}

// ---------- QRIS + konfirmasi WA ----------
const qrisModal = document.getElementById("qrisModal");
let qrTimerInterval;
let activeOrder = null;

async function openQris() {
  await pruneStaleCartEntries();
  const entries = Object.entries(cart);
  if (entries.length === 0) {
    showToast("Keranjang masih kosong");
    return;
  }

  const items = entries.map(([key, qty]) => {
    const { productId, variantLabel } = parseCartKey(key);
    return { productId, variantLabel, qty };
  });

  let order;
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    order = await res.json();
    if (!res.ok) throw new Error(order.error || "Gagal membuat pesanan");
  } catch (err) {
    showToast(err.message || "Gagal membuat pesanan");
    return;
  }

  activeOrder = order;
  document.getElementById("qrisAmount").textContent = rupiah(order.total);
  document.getElementById("qrisOrder").textContent = "Order #" + order.order_code;

  document.getElementById("qrcode-box").innerHTML = "";
  new QRCode(document.getElementById("qrcode-box"), {
    text: `QRIS-DEMO|${order.order_code}|${order.total}|noonapetshop`,
    width: 176,
    height: 176,
    colorDark: "#1F2A1F",
    colorLight: "#ffffff",
  });

  let seconds = 300;
  clearInterval(qrTimerInterval);
  const timerEl = document.getElementById("qrisTimer");
  qrTimerInterval = setInterval(() => {
    seconds--;
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    timerEl.textContent = `Selesaikan dalam ${m}:${s}`;
    if (seconds <= 0) clearInterval(qrTimerInterval);
  }, 1000);

  closeDrawerFn();
  qrisModal.classList.add("open");
  overlay.classList.add("open");
}

function closeQrisFn() {
  qrisModal.classList.remove("open");
  clearInterval(qrTimerInterval);
}
document.getElementById("checkoutBtn").onclick = openQris;
document.getElementById("closeQris").onclick = () => {
  closeQrisFn();
  overlay.classList.remove("open");
};

document.getElementById("confirmWaBtn").onclick = () => {
  if (!activeOrder) return;
  const pesananLines = activeOrder.items
    .map((li) => `- ${li.name}${li.variantLabel ? ` (${li.variantLabel})` : ""} x${li.qty}`)
    .join("\n");
  const totalQty = activeOrder.items.reduce((sum, li) => sum + li.qty, 0);
  const message =
    `\u2705 *Pembayaran Berhasil!*\n` +
    `Terima kasih atas pembayaran Anda.\n` +
    `Order ID: ${activeOrder.order_code}\n` +
    `Pesanan:\n${pesananLines}\n` +
    `Jumlah pesanan: ${totalQty} item\n` +
    `Total pembayaran: ${rupiah(activeOrder.total)}\n` +
    `Admin akan segera memproses pesanan Anda.\n` +
    `Mohon ditunggu ya! \u{1F64F}`;

  window.open(waLink(message), "_blank", "noopener");

  // pesanan sudah dikonfirmasi ke WA -> kosongkan keranjang & tutup modal
  cart = {};
  saveCart(cart);
  updateCartBadge();
  closeQrisFn();
  overlay.classList.remove("open");
  showToast("Membuka WhatsApp untuk konfirmasi…");
  activeOrder = null;
};

// ---------- WhatsApp quick links (layanan) ----------
function wireWaOpenLinks() {
  document.querySelectorAll(".js-wa-open").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(waLink(el.dataset.msg || "Halo Noona!"), "_blank", "noopener");
    });
  });
}

// ---------- search / filter wiring ----------
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

document.getElementById("sortSelect").addEventListener("change", (e) => {
  state.sort = e.target.value;
  loadProducts();
});

document.getElementById("statusChips").addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-chip");
  if (!btn) return;
  document.querySelectorAll("#statusChips .filter-chip").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  state.status = btn.dataset.status;
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
(async function init() {
  await loadConfig();
  await loadServices();
  await loadCategories();
  await loadProducts();
  await pruneStaleCartEntries();
  updateCartBadge();
  renderHoursList();
})();
