// Isi bawaan semua layanan (Grooming, Pet Care, Pet Hotel) — sama persis dengan tampilan di situs.
// Dipakai oleh seed otomatis (db/connection.js) dan skrip scripts/seed-services.js.

const sizeTiers = (prices) => [
  { label: "S (1 - 2.5 kg)", price: prices[0] },
  { label: "M (2.6 - 4 kg)", price: prices[1] },
  { label: "L (4.1 - 5.3 kg)", price: prices[2] },
  { label: "XL (5.4 - 7.2 kg)", price: prices[3] },
  { label: "XXL (7.3 - 10 kg)", price: prices[4] },
];

const SERVICES = [
  // ---------- GROOMING ----------
  {
    category: "grooming",
    name: "Basic Grooming",
    icon: "🛁",
    description: "Mandi, potong kuku, bersihkan telinga, parfum. Perawatan rutin harian.",
    tiers: sizeTiers([75000, 85000, 100000, 110000, 120000]),
  },
  {
    category: "grooming",
    name: "Treatment Grooming",
    icon: "🧴",
    description:
      "Mandi pakai shampo khusus untuk mengatasi jamur & kutu, potong kuku, bersihkan telinga, parfum.",
    tiers: sizeTiers([85000, 105000, 110000, 120000, 130000]),
  },
  {
    category: "grooming",
    name: "Luxury Grooming",
    icon: "✨",
    description:
      "Mandi pakai shampo mewah, potong kuku, rapikan bulu kaki, bersihkan telinga, parfum — paket paling lengkap.",
    tiers: sizeTiers([100000, 130000, 135000, 140000, 150000]),
  },
  {
    category: "grooming",
    name: "Other Treatment",
    icon: "➕",
    description: "Layanan tambahan à la carte, bisa dipesan terpisah dari paket grooming.",
    tiers: [
      { label: "Lion Cut", price: 90000 },
      { label: "Paw / Butt Trimming", price: 20000 },
      { label: "Nail Trimming", price: 10000 },
      { label: "Ear Cleaning", price: 15000 },
      { label: "Matted Shaved", price: 25000 },
    ],
  },

  // ---------- PET CARE (tanpa daftar harga tetap) ----------
  {
    category: "pet-care",
    name: "Check Up",
    icon: "🩺",
    description: "Pemeriksaan kondisi kesehatan anabul secara menyeluruh.",
    tiers: [],
  },
  {
    category: "pet-care",
    name: "Konsultasi",
    icon: "💬",
    description: "Konsultasi mengenai kondisi dan kebutuhan kesehatan anabul.",
    tiers: [],
  },
  {
    category: "pet-care",
    name: "Vaksin",
    icon: "💉",
    description: "Layanan vaksinasi untuk membantu menjaga kesehatan anabul.",
    tiers: [],
  },
  {
    category: "pet-care",
    name: "Home Visit",
    icon: "🏡",
    description: "Pemeriksaan dan perawatan anabul melalui layanan kunjungan ke rumah.",
    tiers: [],
  },
  {
    category: "pet-care",
    name: "Steril Jantan & Betina",
    icon: "⚕️",
    description: "Tindakan sterilisasi untuk anabul jantan dan betina sesuai prosedur perawatan.",
    tiers: [],
  },
  {
    category: "pet-care",
    name: "Minor Surgery",
    icon: "🏥",
    description: "Tindakan bedah ringan sesuai dengan kebutuhan kondisi anabul.",
    tiers: [],
  },

  // ---------- PET HOTEL ----------
  {
    category: "pet-hotel",
    name: "Pet Hotel",
    icon: "🏨",
    description:
      "Layanan penitipan anabul dengan perawatan yang nyaman dan kebutuhan harian yang tetap terjaga selama masa menginap.\n\nSyarat & Ketentuan:\n1. Anabul dalam kondisi sehat\n2. Tidak berjamur dan berkutu\n3. Sudah vaksin (minimal vaksin pertama dan menyertakan buku vaksin)",
    tiers: [
      { label: "Per hari (include pasir)", price: 40000 },
      { label: "Per hari (include pasir & pakan standar dari kami)", price: 45000 },
    ],
  },
  {
    category: "pet-hotel",
    name: "Rawat Inap",
    icon: "🛏️",
    description:
      "Layanan perawatan dan pemantauan selama masa pemulihan dengan kebutuhan perawatan yang disesuaikan dengan kondisi anabul.",
    tiers: [{ label: "Per hari", price: 55000 }],
  },
];

module.exports = { SERVICES };
