# ProQTrack — Field Team Monitoring System

Sistem monitoring lapangan untuk **tim field sales / supervisor** di Indonesia.

Kunjungan outlet, absensi, stok, harga, intel kompetitor, foto bukti, project management, dan dashboard manager — prototype client-side berbasis localStorage.

## Fitur

- Dashboard & live tracking (Leaflet)
- Kunjungan outlet (check-in / out)
- Produk, stok outlet, observasi harga
- Kompetitor + intel lapangan + jenis promo strategis
- Foto lapangan (lokasi, produk, rak, kompetitor) — dikompres otomatis
- Absensi & ijin/cuti
- **Project Management v7**:
  - master klien + PIC utama/tambahan
  - project + kode unik + SoW + periode + target + nilai kontrak
  - assignment supervisor/sales/viewer
  - hierarchy supervisor → sales
  - module flags per project
  - menu Project Saya, Tim Saya, dan Komparasi Supervisor
  - tagging `projectId` untuk visit, intel, foto, harga, dan stok baru
- Role: Manager | Supervisor | Field Sales

## Demo login

| Role | Email | Password |
|------|-------|----------|
| Manager | `manager@proqtrack.id` | `demo123` |
| Supervisor | `rizky.supervisor@proqtrack.id` | `demo123` |
| Field Sales | `budi.employee@proqtrack.id` | `demo123` |

Akun UAT lain: `siti.supervisor@`, `dewi.employee@` — password `demo123`. Password tidak ditampilkan di halaman login.

## Jalankan lokal

```bash
cd proqtrack
git pull origin main
python3 -m http.server 8080
# buka http://localhost:8080
```

Butuh static server karena aplikasi memakai ES modules.

## Cara uji Project Management

### Manager

1. Login `manager@proqtrack.id`.
2. Buka **Project → Klien** untuk tambah/edit klien dan PIC.
3. Buka **Project → Project** untuk tambah/edit project, SoW, periode, target, dan nilai kontrak.
4. Buka detail project untuk:
   - assign/unassign employee
   - memilih role project
   - mengatur supervisor pelaporan
   - mengaktifkan/nonaktifkan modul field
5. Buka **Project → Assignment** untuk overview seluruh assignment.

### Supervisor

1. Login `rizky.supervisor@proqtrack.id`.
2. Buka **Project Saya** untuk project read-only.
3. Buka **Tim Saya** untuk sales dengan `supervisorId` yang sesuai.
4. Buka **Komparasi Supervisor** untuk metrik agregat pada project yang sama.

### Sales

1. Login `budi.employee@proqtrack.id`.
2. Buka **Project Saya**.
3. Menu field mengikuti module flags project aktif yang di-assign.
4. Saat membuat visit/intel/foto/harga/stok, pilih project bila assignment aktif lebih dari satu.

## Reset data demo

Di console browser:

```js
FT.resetDB();
localStorage.removeItem('proqtrack_db_v7');
location.reload();
```

## Cloudflare MVP foundation

- Static application + API Worker dideploy melalui GitHub Actions.
- D1 binding `DB` menyimpan snapshot aplikasi dan metadata file.
- R2 binding `FILES` disiapkan untuk foto/lampiran.
- Upload dibatasi maksimal 2 MB per file dan total 500 MB pada level aplikasi.
- Endpoint data dikunci secara default melalui `MVP_DATA_API_ENABLED=false`
  sampai autentikasi backend diaktifkan.
- Endpoint operasional: `/api/health` dan `/api/usage`.
- Cloudflare Budget Alert tetap harus dibuat manual karena alert bukan spending cap.

## Catatan teknis

- **DB internal:** version 7
- **Backward compatibility:** aplikasi inti tetap memakai `proqtrack_db_v6`; modul v7 memigrasikan dan mencerminkan data ke `proqtrack_db_v7`
- **Stack:** Vanilla JS ES modules, hash router, CSS mobile-first, Leaflet CDN
- **Penyimpanan:** seluruh data berada di localStorage browser, termasuk foto base64
- Record lama memperoleh `projectId: null` dan tetap terlihat manager
- Password demo plain text — hanya untuk prototype
- Jika penyimpanan penuh saat upload foto, hapus foto lama atau reset data demo

## Struktur

```text
proqtrack/
├── index.html
├── README.md
├── assets/             # branding, PWA, visual phase 0
└── src/
    ├── app.js          # router + UI field existing
    ├── phase0-data.js
    ├── phase0-ui.js
    ├── data/seed.js
    ├── lib/db.js
    ├── lib/utils.js
    └── types/index.js  # domain + UI Project Management v7
```

## Batasan prototype

- Belum ada backend / sync multi-device
- Kapasitas foto terbatas kuota localStorage browser
- Belum ada CI/test otomatis
- Enforcement role masih client-side dan bukan pengganti authorization server

---
ProQTrack — Field Team Monitoring prototype
