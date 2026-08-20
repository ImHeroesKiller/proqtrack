# ProQTrack — Field Team Monitoring System

Sistem monitoring lapangan untuk **tim field sales / supervisor** di Indonesia.

- User guide: [docs/USER-GUIDE.md](docs/USER-GUIDE.md)
- Update 19 Agustus 2026: [docs/UPDATES-2026-08-19.md](docs/UPDATES-2026-08-19.md)

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
- Role: Superadmin | Head (1 organisasi) | Manager (1 project) | Supervisor | Field Sales

## Demo login

Akun prototype lokal (password **tidak** dipublikasikan di repo publik ini):

| Role | Email |
|------|-------|
| Superadmin | `superadmin@proqtrack.id` |
| Head (1 org) | `head@proqtrack.id` or `manager@proqtrack.id` |
| Manager (1 project) | `pm@proqtrack.id` |
| Supervisor | `rizki.pratama@proqtrack.id` |
| Field Sales | `budi.santoso@proqtrack.id` |

Minta password UAT ke pemilik repo. Setelah `git pull`, reset data demo jika login gagal — seed versi baru memakai hash yang berbeda. Password tidak ditampilkan di halaman login.

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

- Static application + API Worker dideploy melalui GitHub Actions (`npm test` wajib lulus sebelum deploy).
- D1 binding `DB` menyimpan snapshot aplikasi, metadata file, dan tabel `auth_users`.
- R2 binding `FILES` disiapkan untuk foto/lampiran, **tetapi file API dikunci** (`MVP_FILE_API_ENABLED=false`) sampai login server hidup.
- Upload dibatasi maksimal 2 MB per file dan total 500 MB pada level aplikasi.
- `POST /api/auth/session` **tidak lagi** menerbitkan token dari `role`/`sub` yang dikirim klien (HTTP 410).
- Token cloud hanya keluar dari `POST /api/auth/login` setelah email/password cocok dengan baris `auth_users` di D1. Role diambil dari database, bukan dari body request.
- `API_AUTH_SECRET` wajib di-set lewat `wrangler secret put API_AUTH_SECRET` (minimal 32 karakter). Tidak ada fallback di source. Deploy workflow mengisi secret ini **hanya jika belum ada** (nilai tidak di-log).
- Token hanya diterima di header `Authorization: Bearer`. Query `?access=` diabaikan.
- Endpoint data tetap dikunci (`MVP_DATA_API_ENABLED=false`).
- Endpoint publik: `GET /api/health`. Login: `POST /api/auth/login`.
- Cloudflare Budget Alert tetap harus dibuat manual karena alert bukan spending cap.

## Catatan teknis

- **DB internal:** version 14
- **Backward compatibility:** aplikasi inti memakai `proqtrack_db_v6`; `proqtrack_db_v7` hanya cermin otomatis dari v6 (bukan schema terpisah)
- **Katalog dokumen:** `SCHEMA` di `src/lib/db.js` adalah daftar collection resmi. Tenant rows memakai `organizationId`; katalog global (`leaveTypes`, `promoTypes`, laporan) tidak di-scope per organisasi
- **D1 bukan schema operasional:** tabel Worker (`app_snapshots`, `auth_users`, `file_metadata`, …) adalah sidecar. Jangan dinormalisasi ke tabel CRM
- **Stack:** Vanilla JS ES modules, hash router, CSS mobile-first, Leaflet CDN
- **Penyimpanan:** seluruh data operasional masih di localStorage browser, termasuk foto base64
- Record lama memperoleh `projectId: null` dan tetap terlihat manager
- Password seed disimpan sebagai hash `sha256$…` — bukan plaintext di repo
- Device lock sales memakai `deviceId` + hash `deviceBinding` (bukan IMEI sungguhan — browser tidak bisa baca IMEI)
- Jika penyimpanan penuh saat upload foto, hapus foto lama atau reset data demo

## Struktur

```text
proqtrack/
├── index.html
├── README.md
├── worker/index.js     # Cloudflare API + auth
├── migrations/         # D1 schema
├── tests/              # node:test (auth + password)
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

- Belum ada sync multi-device untuk data operasional (masih localStorage)
- Kapasitas foto terbatas kuota localStorage browser
- Enforcement role di UI + `src/lib/db.js` adalah **konvensi client-side**. Siapa pun yang mengedit `localStorage` bisa mengubah data. Itu disengaja untuk prototype; jangan anggap ini batas keamanan multi-tenant.
- Role di sesi selalu di-rejoin dari baris `accounts[]` — mengubah `FT.state.account.role` di console tidak menaikkan hak.
- Kunci perangkat sales menolak copy `deviceId` saja; menyalin **kedua** key `proqtrack_device_id_v1` + `proqtrack_device_secret_v1` masih bisa meniru device (batas browser).
- Mesin tempat superadmin login ditandai host dan boleh masuk sebagai sales untuk UAT, tanpa merusak pairing HP sales.
- Tabel `auth_users` kosong secara default — tidak ada akun cloud sampai diisi terpisah dari seed demo
- Dependabot mengirim PR mingguan untuk npm + GitHub Actions. Branch `main` dilindungi ruleset (wajib PR).

---
ProQTrack — Field Team Monitoring prototype
