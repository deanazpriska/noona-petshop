/**
 * Penyimpanan foto produk di Supabase Storage (bucket publik).
 *
 * Foto TIDAK lagi disimpan di folder server (public/uploads), jadi tidak hilang
 * saat server restart/deploy ulang. Di database cukup disimpan URL publiknya,
 * dan frontend langsung memakai URL itu di <img src="...">.
 *
 * Butuh SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.
 * ⚠️ service_role key RAHASIA — hanya boleh ada di server (.env), jangan di frontend/git.
 */
const { createClient } = require("@supabase/supabase-js");

const BUCKET = process.env.SUPABASE_BUCKET || "product-images";
const MAX_BYTES = 3 * 1024 * 1024; // 3MB, sama dengan batas upload di route

let client = null;
function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi di .env.");
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** Buat bucket publik kalau belum ada (aman dipanggil berulang). */
async function ensureBucket() {
  const supabase = getClient();
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw new Error(`Gagal cek bucket Supabase: ${listErr.message}`);
  if (buckets.some((b) => b.name === BUCKET)) return;

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Gagal membuat bucket "${BUCKET}": ${error.message}`);
  }
  console.log(`🪣 Bucket Storage "${BUCKET}" dibuat (publik).`);
}

/** Upload buffer gambar, kembalikan URL publiknya. */
async function uploadImage(fileName, buffer, contentType) {
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).upload(fileName, buffer, {
    contentType,
    upsert: false,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`Gagal upload ke Supabase Storage: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(fileName).data.publicUrl;
}

/** Hapus foto berdasarkan URL publiknya. Kalau URL bukan dari bucket ini, diabaikan. */
async function deleteByUrl(url) {
  if (!url) return;
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return; // mis. path lama "/uploads/..." atau URL luar — tidak disentuh
  const objectPath = decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
  const { error } = await getClient().storage.from(BUCKET).remove([objectPath]);
  if (error) console.warn("Gagal menghapus foto lama di Storage:", error.message);
}

module.exports = { BUCKET, ensureBucket, uploadImage, deleteByUrl };
