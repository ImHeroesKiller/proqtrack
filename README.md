# ProQTrack — Field Team Monitoring System

Sistem monitoring real-time untuk **tim lapangan / field sales** di Indonesia.

Lacak kunjungan outlet, absensi, lokasi karyawan, stok produk, dan pengajuan ijin/cuti dengan dashboard interaktif.

## Fitur Utama

- **Dashboard** — Ringkasan aktivitas tim
- **Live Tracking** — Peta real-time lokasi karyawan (Leaflet + OpenStreetMap)
- **Kunjungan Outlet** — Check-in / check-out + rating + catatan
- **Manajemen Karyawan & Outlet**
- **Produk & Stok Outlet** (dengan alert stok menipis)
- **Absensi**
- **Ijin & Cuti** (dengan approval workflow)
- **Role-based Access** (Manager vs Field Sales)
- **Mobile Simulation** (tampilan app HP)

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
- rizki.pratama@proqtrack.id / rizki123
- maya.sari@proqtrack.id / maya123
- fajar.nugroho@proqtrack.id / fajar123
- indah.permata@proqtrack.id / indah123

## Cara Menjalankan (Lokal)

Karena aplikasi ini pure client-side (ES Modules + localStorage), cukup:

```bash
# Option 1: Python simple server
cd proqtrack
python3 -m http.server 8080
# Buka http://localhost:8080

# Option 2: npx serve
npx serve .
```

Atau buka `index.html` langsung di browser (beberapa browser modern mungkin block ES modules dari file://).

## Tech Stack

- Vanilla JavaScript (ES Modules)
- CSS Custom Design System
- Leaflet 1.9.4 (peta)
- localStorage sebagai database

## Struktur Folder

```
proqtrack/
├── index.html          # App shell + CSS
├── main.pjs            # Metadata (Perchance)
├── README.md
└── src/
    ├── app.js          # Main application (router + renderers)
    ├── lib/
    │   ├── db.js       # Database layer
    │   └── utils.js    # Helper functions
    ├── data/
    │   └── seed.js     # Seed data
    ├── types/
    │   └── index.js    # JSDoc types
    └── CHANGE.log      # Development history
```

## Development Notes

- Database key: `proqtrack_db_v3` (localStorage)
- Auth: plain text (demo only)
- Map: Leaflet dari unpkg CDN
- Semua data seed berbahasa Indonesia (Jakarta area)

---

**Rebranded from FAST TRACK → ProQTrack**
