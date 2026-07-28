# ProQTrack — Field Team Monitoring System

Sistem monitoring lapangan untuk **tim field sales / supervisor** di Indonesia.

Kunjungan outlet, absensi, stok, harga, intel kompetitor, foto bukti, dan dashboard manager — prototype client-side (localStorage).

## Fitur

- Dashboard & live tracking (Leaflet)
- Kunjungan outlet (check-in / out)
- Produk, stok outlet, observasi harga
- Kompetitor + intel lapangan + jenis promo strategis
- Foto lapangan (lokasi, produk, rak, kompetitor) — dikompres otomatis
- Absensi & ijin/cuti
- Role: Manager | Supervisor | Field Sales

## Demo login

| Role | Email | Password |
|------|-------|----------|
| Manager | `manager@proqtrack.id` | `demo123` |
| Field Sales | `budi.santoso@proqtrack.id` | `budi123` |
| Supervisor | `rizki.pratama@proqtrack.id` | `rizki123` |

Akun lain: `siti.nurhaliza@`, `ahmad.wijaya@`, `dewi.lestari@`, `maya.sari@`, `indah.permata@` — password pola `nama123`.

## Jalankan lokal

```bash
cd proqtrack
python3 -m http.server 8080
# http://localhost:8080
```

Butuh static server (ES modules tidak nyaman dari `file://`).

## Reset data demo

Di console browser:

```js
FT.resetDB();
location.reload();
```

## Catatan teknis

- **DB key:** `proqtrack_db_v6` (migrasi otomatis dari v1–v5)
- **Stack:** Vanilla JS (ES modules), CSS mobile-first, Leaflet CDN
- **Penyimpanan:** seluruh data di `localStorage` browser (termasuk foto base64)
- Jika muncul error **penyimpanan penuh** saat upload foto: hapus foto lama atau `FT.resetDB()`
- Password demo **plain text** — hanya untuk prototype, jangan dipakai production
- Tanggal dashboard memakai **hari ini (WIB)**, bukan tanggal seed

## Struktur

```
proqtrack/
├── index.html          # Shell + CSS
├── README.md
├── .gitignore
└── src/
    ├── app.js          # Router + UI
    ├── CHANGE.log
    ├── data/seed.js
    ├── lib/db.js       # localStorage DB + migrasi
    ├── lib/utils.js
    └── types/index.js
```

## Batasan prototype

- Tidak ada backend / sync multi-device
- Kapasitas foto terbatas kuota localStorage browser
- Belum ada CI/test otomatis

---
ProQTrack — Field Team Monitoring (prototype)
