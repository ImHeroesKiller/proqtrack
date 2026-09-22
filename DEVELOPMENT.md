# Development Guide

## Prinsip wajib

1. Stabilitas `main` lebih penting daripada mengaktifkan semua fitur sekaligus.
2. D1 adalah sumber kebenaran collection cloud-authoritative.
3. Request wajib terikat user, organisasi, role, dan jika relevan project.
4. Perubahan data harus idempotent, tenant-safe, dan dapat dipulihkan.
5. Schema selalu additive melalui migrasi baru; migrasi production tidak diedit.
6. UI tidak boleh mengubah kegagalan data menjadi sukses semu.

## Arsitektur

```text
Browser/PWA
  ├─ index.html → src/entry.js → src/bootstrap.js → src/app.js
  ├─ cache/offline compatibility
  └─ Bearer-authenticated /api/*
          ↓
Cloudflare Worker
  ├─ auth + authorization
  ├─ bootstrap/sync + bulk
  ├─ evidence/report/workflow
  └─ D1 + R2
```

| Lokasi | Tanggung jawab |
|---|---|
| `src/app.js` | router dan UI utama |
| `src/lib/db.js` | cache lokal, scoping, domain operations |
| `src/lib/cloud-data.js` | bootstrap/sync dan cloud collection list |
| `src/cloud-cutover.js` | cloud-first login/session restore |
| `src/bulk-master.js` | UI bulk master |
| `worker/main.js` | router Worker |
| `worker/authz.js` | auth/session/claims |
| `worker/operations.js` | canonical data, authorization, bootstrap/sync |
| `worker/master-bulk.js` | preview/commit bulk |
| `migrations/` | schema/seed D1 additive |
| `tests/` | regression/security/integration contracts |

## Menambah collection cloud

Perubahan belum lengkap sampai mencakup:

1. Migrasi tabel/index/foreign key.
2. `CLOUD_COLLECTIONS` client.
3. `ENTITY_COLLECTIONS` dan `ENTITY_TABLES` server.
4. Normalisasi row.
5. Upsert/delete statements.
6. Decode database ke UI shape.
7. Bootstrap query dan role filtering.
8. Authorization role/project.
9. Import order dependency.
10. Regression dan migration-from-empty test.

Jangan hanya menambah tabel UI atau local seed. Itu dapat menghasilkan badge berisi angka tetapi tabel kosong karena referensi berbeda.

## Integrity, sync, dan concurrency

- ID harus namespaced dan unik bila primary key bersifat global.
- Semua reference harus valid di organisasi yang sama.
- Summary, badge, dan tabel wajib memakai dataset valid yang sama.
- Shared relation lintas project tidak boleh tertimpa.
- Entity dengan histori di-archive, bukan hard delete, bila relevan.
- Mutation memakai idempotency key.
- Bulk memakai import ID, chunk order/total, dan payload hash.
- Revision conflict tidak boleh silent overwrite.
- Retry hanya untuk network, `429`, atau `5xx`.
- Setelah commit, lakukan authoritative re-bootstrap.

## Role boundaries

| Role | Scope |
|---|---|
| Superadmin | login global, lalu pilih tenant aktif sebelum bootstrap |
| Head/Admin | seluruh data satu organisasi |
| Manager | project assigned; bukan owner katalog organisasi |
| Supervisor | tim dan project assigned |
| Employee | data sendiri dan aktivitas project assigned |

Menyembunyikan tombol bukan security boundary; enforcement wajib di Worker.

## Authentication flow

1. Hapus bearer lama sebelum login.
2. Superadmin login global tanpa tenant cache.
3. Ambil/pilih organisasi aktif.
4. Terbitkan bearer tenant.
5. Bootstrap setelah `organizationId` tersedia.
6. Isi cache lokal dari bootstrap cloud.

Jangan mengirim stale tenant pada global login dan jangan bootstrap memakai global session tanpa tenant.

## UI/UX constraints

- Gunakan bahasa operasional yang mudah dipahami.
- Jangan tampilkan D1, R2, Worker, Cloudflare, GitHub, schema, revision, nama tabel, atau stack trace pada toast/modal.
- Technical detail hanya di structured logs/console.
- Login harus mendukung Enter, autofill, dan accessible password toggle.
- Uji desktop serta mobile untuk Employee/Supervisor.

## Performance constraints

- Hindari font/resource render-blocking.
- Script non-kritis `defer` atau lazy-loaded.
- Jangan tambah asset besar ke precache tanpa alasan.
- `/api/*` tidak boleh dicache Service Worker.
- Bump cache version jika frontend harus segera terganti, lalu update test.
- Kompres foto dan patuhi batas upload.

## Workflow lokal

```bash
npm ci
git diff --check
npm test
npm run build
npx wrangler deploy --dry-run --env=""
```

Migrasi dari database kosong:

```bash
tmpdir="$(mktemp -d)"
npx wrangler d1 migrations apply DB --local --persist-to "$tmpdir"
```

Jangan commit `dist/`, `.wrangler/`, database lokal, token, atau recovery artifact.

## Arah pengembangan

1. UAT seluruh role setelah authority P2: Price Observation, Competitor Intel, Outlet Proposal, evidence photo.
2. Tambahkan E2E login → tenant → bootstrap → CRUD → logout.
3. Tambahkan UAT conflict dua device dan UX review/merge perubahan offline yang ditahan.
4. Migrasikan inline event attributes ke event listener agar `script-src-attr 'unsafe-inline'` dapat dihapus.
5. Evaluasi self-host library export dokumen yang saat ini lazy-loaded exact-version.
6. Rapikan label M7/M8 setelah stabil tanpa mengubah resource live.

## Runtime bootstrap rule

Runtime production wajib memiliki satu entry graph yang eksplisit.

1. `index.html` hanya memuat static styles, self-hosted vendor runtime, dan `src/entry.js`.
2. `src/entry.js` hanya mengorkestrasi branding + `src/bootstrap.js`; jangan menambahkan business module ke entry.
3. `assets/logo.js` hanya untuk asset/stylesheet/manifest/theme registration. Jangan menambahkan import feature, auth, sync, reports, atau offline ke file ini.
4. Semua module side-effect browser ditambahkan melalui `src/bootstrap.js` dengan urutan yang disengaja.
5. Pertahankan urutan kompatibilitas utama: extension/report modules → `cloud-cutover.js` → `m4-bootstrap.js` → M6 client → `app.js`. Cloud cutover memasang online handler lebih dulu; offline login kemudian membungkusnya hanya untuk kondisi offline.
6. Perubahan runtime graph wajib memperbarui `tests/runtime-bootstrap.test.mjs`.
7. Jangan membuat direct import baru ke `src/app.js` dari `index.html`; gunakan bootstrap.
8. Setelah perubahan bootstrap/PWA, bump cache version di `sw.js` agar client lama tidak tertahan pada graph sebelumnya.

Diagnostic browser yang diizinkan untuk engineering adalah `window.__PROQTRACK_BOOT__`. Jangan menampilkan nama D1, Cloudflare, GitHub, module path, atau istilah implementasi lain sebagai popup pengguna.

## P1 security and integrity rules

- Semua user-controlled value yang masuk HTML wajib memakai `esc()` atau safe DOM API. Untuk inline handler argument gunakan helper yang menghasilkan JSON string lalu HTML-escape; jangan interpolasi ID/string mentah.
- Master competitor menggunakan write sanitization sebagai defense-in-depth, tetapi output encoding tetap wajib.
- ID baru harus dibuat melalui `uid()`/UUID. Jangan membuat predictable tenant-local ID untuk entity cloud-authoritative.
- Perubahan sync/import tidak boleh menyamarkan cross-tenant ID collision sebagai sukses.
- Visit/attendance/leave yang sudah menjadi evidence final tidak boleh di-hard-delete atau dikoreksi langsung oleh field role. Gunakan workflow koreksi/exception.
- Approval dan report schedule tidak boleh disimpan sebagai local authority. Gunakan `window.ProQTrackM6.workflows` dan `window.ProQTrackM6.schedules`.
- Jangan menambahkan reusable password/recovery verifier ke migration atau source. Fresh environment harus fail-closed dan credential provisioning dilakukan secara eksplisit.
- Server password hashing baseline adalah PBKDF2-HMAC-SHA256 `600000` iterations; verifikasi hash lama hanya untuk migration-on-login.

## P2 reliability and runtime rules

- Collection operasional yang memengaruhi laporan/keputusan lintas perangkat harus server-authoritative. Jangan menambah collection tenant lokal baru tanpa keputusan authority eksplisit.
- `fieldPhotos` adalah metadata projection dari evidence authority; binary evidence tetap lewat evidence API/R2 dan tidak dimasukkan ke core sync.
- Revision conflict wajib fail-closed. Jangan auto-replay snapshot penuh setelah menerima server revision yang lebih baru.
- Target live adalah konfigurasi default Wrangler. Jangan membuat named environment baru yang tampak seperti live tanpa migrasi resource, runbook, dan deployment gate terpisah.
- Runtime dependency kritis harus self-hosted bila memungkinkan. Library export eksternal harus exact-version dan URL allowlisted.
- Executable script element tidak boleh bergantung pada `'unsafe-inline'`. Legacy event attributes diisolasi sementara melalui `script-src-attr`.
- Service Worker registration hanya dari `src/m4-bootstrap.js`.
- Precache harus berdasarkan runtime application shell, bukan seluruh source tree. Source yang tidak runtime-reachable tetap boleh ada di `dist` untuk module fetch, tetapi tidak otomatis masuk install cache.
- Compatibility module tanpa caller/test owner harus dihapus, bukan terus dimuat untuk berjaga-jaga.

