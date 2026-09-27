// Katalog publik — read-only untuk data produk/layanan (tidak butuh login).
// Keranjang & checkout di file ini murni aksi PELANGGAN: order dibuat lewat
// POST /api/orders (publik), lalu dikonfirmasi manual oleh pelanggan sendiri
// via WhatsApp. Tidak ada endpoint admin yang dipanggil dari sini.

const state = {
  search: "",
  category: "semua",
  sort: "",
  page: 1,
  limit: 12,
};

let WA_NUMBER = "";
const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");

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
  const heroWaBtn = document.getElementById("heroWaBtn");
  if (heroWaBtn) heroWaBtn.href = waLink("Halo Noona, saya mau tanya-tanya");
}
function waLink(msg) {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
}

// ---------- layanan ----------
// Layanan sekarang dipecah jadi 3 kategori (Grooming, Pet Care, Pet Hotel), masing-masing
// punya "rute" sendiri (/layanan/<kategori>) yang menampilkan daftar jenis layanannya
// berbentuk card. Pet Care & Pet Hotel belum ada isinya — akan tampil "segera hadir".
const LAYANAN_META = {
  grooming: { label: "Grooming", icon: "🛁" },
  "pet-care": { label: "Pet Care", icon: "🐾" },
  "pet-hotel": { label: "Pet Hotel", icon: "🏠" },
};

function renderServiceTickets(services, grid, category) {
  if (!services || services.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="emoji">🐾</div>Segera hadir.<br>Layanan ini masih kami siapkan.</div>`;
    return;
  }

  // Pet Hotel dirender sebagai card horizontal bertumpuk (bukan grid vertikal),
  // biar rapat mengikuti isinya tanpa ruang kosong.
  if (category === "pet-hotel") {
    grid.innerHTML = services
      .map((s) => {
        const hasPrice = s.tiers && s.tiers.length > 0;
        return `
    <div class="ticket-h">
      <div class="ticket-h-top">
        <div class="ticket-h-icon">${s.icon}</div>
        <div class="ticket-h-text">
          <h3>${escapeHtml(s.name)}</h3>
          <p>${escapeHtml(s.description)}</p>
          ${
            hasPrice
              ? `<div class="tier-price-list">
            ${s.tiers.map((t) => `<div class="tier-price-row"><span>${escapeHtml(t.label)}</span><b>${rupiah(t.price)}</b></div>`).join("")}
          </div>`
              : ""
          }
        </div>
      </div>
      <div class="ticket-h-bottom">
        <a href="#" class="mini-link js-wa-open" data-msg="Halo Noona, saya mau booking ${escapeHtml(s.name)}">Booking →</a>
      </div>
    </div>`;
      })
      .join("");
    wireWaOpenLinks();
    return;
  }

  grid.innerHTML = services
    .map((s) => {
      const hasPrice = s.tiers && s.tiers.length > 0;
      return `
    <div class="ticket">
      <div class="ticket-top">
        <div class="ticket-icon">${s.icon}</div>
        <h3>${escapeHtml(s.name)}</h3>
        <p>${escapeHtml(s.description)}</p>
        ${
          hasPrice
            ? `<div class="tier-price-list">
          ${s.tiers.map((t) => `<div class="tier-price-row"><span>${escapeHtml(t.label)}</span><b>${rupiah(t.price)}</b></div>`).join("")}
        </div>`
            : ""
        }
      </div>
      <div class="ticket-perf"></div>
      <div class="ticket-bottom${hasPrice ? "" : " no-price"}">
        ${hasPrice ? `<span class="price">mulai ${rupiah(s.startingPrice)}</span>` : ""}
        <a href="#" class="mini-link js-wa-open" data-msg="Halo Noona, saya mau booking ${escapeHtml(s.name)}">Booking →</a>
      </div>
    </div>`;
    })
    .join("");
  wireWaOpenLinks();
}

async function loadServicesForCategory(category) {
  const res = await fetch("/api/services?category=" + encodeURIComponent(category));
  const services = await res.json();
  renderServiceTickets(services, document.getElementById("servicesGrid"), category);
}

function showLayananCategories() {
  document.getElementById("layananCategories").style.display = "flex";
  document.getElementById("layananDetail").style.display = "none";
}

async function showLayananDetail(category) {
  const meta = LAYANAN_META[category];
  if (!meta) {
    showLayananCategories();
    return;
  }
  document.getElementById("layananCategories").style.display = "none";
  document.getElementById("layananDetail").style.display = "block";
  document.getElementById("layananDetailIcon").textContent = meta.icon;
  document.getElementById("layananDetailTitle").textContent = meta.label;
  const grid = document.getElementById("servicesGrid");
  grid.classList.remove("services-grid--pet-care", "services-grid--pet-hotel");
  if (category === "pet-care") grid.classList.add("services-grid--pet-care");
  if (category === "pet-hotel") grid.classList.add("services-grid--pet-hotel");
  const note = document.getElementById("layananNote");
  if (category === "pet-care") {
    note.textContent = "*Harga disesuaikan dengan treatment yang diberikan";
    note.style.display = "block";
  } else {
    note.style.display = "none";
  }
  await loadServicesForCategory(category);
}

// ---------- routing sederhana untuk /layanan/<kategori> ----------
function layananCategoryFromPath(pathname) {
  const m = pathname.match(/^\/layanan\/([a-z-]+)\/?$/);
  return m && LAYANAN_META[m[1]] ? m[1] : null;
}

function renderLayananRoute() {
  const category = layananCategoryFromPath(window.location.pathname);
  if (category) {
    showLayananDetail(category);
  } else {
    showLayananCategories();
  }
}

// ---------- mobile nav sidebar (hamburger) ----------
const menuToggle = document.getElementById("menuToggle");
const mobileNavSidebar = document.getElementById("mobileNavSidebar");
const mobileNavOverlay = document.getElementById("mobileNavOverlay");
const mobileNavClose = document.getElementById("mobileNavClose");

function openMobileNav() {
  mobileNavSidebar.classList.add("show");
  mobileNavOverlay.classList.add("show");
  menuToggle.classList.add("active");
  menuToggle.setAttribute("aria-expanded", "true");
  mobileNavSidebar.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
}
function closeMobileNav() {
  mobileNavSidebar.classList.remove("show");
  mobileNavOverlay.classList.remove("show");
  menuToggle.classList.remove("active");
  menuToggle.setAttribute("aria-expanded", "false");
  mobileNavSidebar.setAttribute("aria-hidden", "true");
  document.body.classList.remove("no-scroll");
}
menuToggle.addEventListener("click", () => {
  if (mobileNavSidebar.classList.contains("show")) closeMobileNav();
  else openMobileNav();
});
mobileNavClose.addEventListener("click", closeMobileNav);
mobileNavOverlay.addEventListener("click", closeMobileNav);
document.querySelectorAll(".mobile-nav-link").forEach((a) => a.addEventListener("click", closeMobileNav));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMobileNav();
});

document.getElementById("layananCategories").addEventListener("click", (e) => {
  const card = e.target.closest(".layanan-cat-card");
  if (!card) return;
  const category = card.dataset.category;
  history.pushState({}, "", `/layanan/${category}`);
  renderLayananRoute();
});

document.getElementById("layananBackBtn").addEventListener("click", () => {
  history.pushState({}, "", "/");
  renderLayananRoute();
  document.getElementById("layanan").scrollIntoView({ behavior: "smooth", block: "start" });
});

window.addEventListener("popstate", renderLayananRoute);

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
      return `
    <div class="pcard">
      <div class="pcard-art" onclick="openDetail(${p.id})">
        <span class="pcard-cat">${p.category}</span>
        ${p.image ? `<img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy">` : p.icon}
      </div>
      <div class="pcard-body">
        <h4 onclick="openDetail(${p.id})" style="cursor:pointer;">${escapeHtml(p.name)}</h4>
        <div class="pcard-foot">
          <span class="price-tag">${priceLabel}</span>
          <button class="add-btn" onclick="openDetail(${p.id})">Pilih Produk</button>
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
  addBtn.disabled = false;
  addBtn.textContent = "+ Tambah ke Keranjang";

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

// ---------- checkout langsung ke WhatsApp ----------
async function handleCheckout() {
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

  const pesananLines = order.items
    .map((li) => `- ${li.name}${li.variantLabel ? ` (${li.variantLabel})` : ""} x${li.qty}`)
    .join("\n");
  const totalQty = order.items.reduce((sum, li) => sum + li.qty, 0);
  const message =
    `\u{1F6CD}\uFE0F *Pesanan Baru*\n` +
    `Halo Noona Petshop, saya ingin memesan:\n` +
    `Order ID: ${order.order_code}\n` +
    `Pesanan:\n${pesananLines}\n` +
    `Jumlah pesanan: ${totalQty} item\n` +
    `Total: ${rupiah(order.total)}\n` +
    `Mohon info ketersediaan & cara pembayarannya ya. Terima kasih! \u{1F64F}`;

  window.open(waLink(message), "_blank", "noopener");

  // pesanan sudah dikirim ke WA -> kosongkan keranjang & tutup drawer
  cart = {};
  saveCart(cart);
  updateCartBadge();
  closeDrawerFn();
  showToast("Membuka WhatsApp untuk memesan…");
}
document.getElementById("checkoutBtn").onclick = handleCheckout;

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
  renderLayananRoute();
  await loadCategories();
  await loadProducts();
  await pruneStaleCartEntries();
  updateCartBadge();
  renderHoursList();
})();
