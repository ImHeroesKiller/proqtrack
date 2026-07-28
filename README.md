# ProQTrack — Field Team Monitoring System

Sistem monitoring real-time untuk **tim lapangan / field sales** di Indonesia.

Lacak kunjungan outlet, absensi, lokasi karyawan, stok produk, intel kompetitor, dan pengajuan ijin/cuti dengan dashboard interaktif.

## Fitur Utama

- **Dashboard** — Ringkasan aktivitas tim
- **Live Tracking** — Peta real-time lokasi karyawan (Leaflet + OpenStreetMap)
- **Kunjungan Outlet** — Check-in / check-out + rating + catatan
- **Manajemen Karyawan & Outlet**
- **Produk** — Katalog lengkap (brand, SKU, kategori, harga, unit, status, cost/margin)
- **Stok Outlet** — Alert stok menipis + input lapangan
- **Harga & Diskon** — Observasi harga di outlet
- **Kompetitor** — Master merek & katalog produk kompetitor
- **Analisa Kompetitor** — Ringkasan price gap, shelf share, jenis promo (Manager)
- **Intel Kompetitor** — Input lapangan + jenis promo strategis (Field Sales / Supervisor)
- **Foto Lapangan** — Capture lokasi/produk/rak/kompetitor (kamera/galeri, auto-kompres)
- **Absensi & Ijin/Cuti** — Approval workflow
- **Role-based Access** (Manager vs Field Sales/Supervisor)

## Demo Accounts

### Manager
```
Email    : manager@proqtrack.id
Password : demo123
```

### Field Sales (contoh)
```
Email    : budi.santoso@proqtrack.id
Password : budi123
```

Akun karyawan lain:
- siti.nurhaliza@proqtrack.id / siti123
- ahmad.wijaya@proqtrack.id / ahmad123
- dewi.lestari@proqtrack.id / dewi123
- rizki.pratama@proqtrack.id / rizki123 (Supervisor)
- maya.sari@proqtrack.id / maya123
- fajar.nugroho@proqtrack.id / fajar123
- indah.permata@proqtrack.id / indah123

## Cara Menjalankan (Lokal)

```bash
cd proqtrack
python3 -m http.server 8080
# Buka http://localhost:8080
```

Atau: `npx serve .`

## Tech Stack

- Vanilla JavaScript (ES Modules)
- CSS Custom Design System (mobile-first)
- Leaflet 1.9.4
- localStorage (`proqtrack_db_v6`)

## Struktur Folder

```
proqtrack/
├── index.html
├── README.md
└── src/
    ├── app.js           # Router + UI
    ├── lib/
    │   ├── db.js        # localStorage DB + CRUD + migration
    │   └── utils.js
    └── data/
        └── seed.js      # Seed Indonesia (FMCG + bangunan)
```

## Cara Test Singkat

1. **Reset data (opsional):** di console browser: `FT.resetDB(); location.reload()`
2. **Manager** → login `manager@proqtrack.id` / `demo123`
   - Menu **Produk**: filter brand/kategori/status, CRUD produk
   - Menu **Kompetitor**: master merek + produk kompetitor
   - Menu **Analisa Kompetitor**: ringkasan per merek + tabel intel (kolom promo = label jenis)
   - Menu **Foto Lapangan**: galeri semua tim
3. **Field Sales** → login `budi.santoso@proqtrack.id` / `budi123`
   - **Hari Saya**: visit `checked-in` (Warung Kopi Nusantara) → Stok / Harga / **Intel** / **Foto**
   - **Intel**: centang “Ada promo” → pilih jenis promo (wajib) + detail; “Lainnya” → input custom
   - **Data Lapangan → Foto Lapangan**: galeri foto sendiri
   - Data terbatas ke outlet yang pernah dikunjungi

---

**ProQTrack** — Field Team Monitoring
