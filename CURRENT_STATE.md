# Current Production State

Snapshot kondisi pada **25 September 2026**, setelah hardening P0–P3. Perbarui dokumen ini jika arsitektur, resource, milestone, risiko, atau baseline test berubah.

## Baseline

| Area | Kondisi |
|---|---|
| URL | `https://proqtrack.arywibowo.workers.dev` |
| Runtime | Cloudflare Worker + static assets |
| D1 live | binding `DB` → `proqtrack-mvp` |
| R2 live | binding `FILES` → `proqtrack-mvp-files` |
| Milestone config | `M7` |
| Service Worker | `proqtrack-v12.44` |
| Migrasi terakhir | `0027_inventory_cycle_correction_uat.sql` |
| Test baseline | CI `main` hijau; baseline numerik divalidasi ulang pada stabilization pass 25 Sep 2026 |
| Deploy | PR → merge `main` → GitHub Actions |

Fitur bulk master sering disebut M8, tetapi `APP_MILESTONE` dan health masih `M7`. Ubah label hanya jika workflow, health assertion, dokumentasi, dan test diperbarui bersama.

## Cloud-authoritative collections

Collection berikut berasal dari D1 melalui bootstrap/sync:

- clients, projects, employees, projectAssignments
- outlets, products, projectProducts
- visits, attendance, productSales
- surveyTemplates, surveyResponses
- competitors, competitorProducts, attendancePoints
- leaves, stocks
- priceObservations, competitorIntel, outletProposals

Daftar client di `CLOUD_COLLECTIONS` (`src/lib/cloud-data.js`) dan daftar server di `ENTITY_COLLECTIONS`/`ENTITY_TABLES` (`worker/operations.js`) harus selalu konsisten.

Browser hanya cache/compatibility layer saat organisasi sudah `cutover_mode='cloud'`. `proqtrack_db_v6` adalah key utama; `proqtrack_db_v7` mirror. Metadata `fieldPhotos` dihydrate dari evidence API/R2 authority dan tidak dikirim ulang melalui core sync. Approval laporan dan report schedule cloud-authoritative. Branding organisasi (nama, logo, warna tema, profil, timezone) bersumber dari profile organisasi cloud. Template dokumen, signature, dan riwayat file export client tetap lokal sebagai presentation/device preference.

## Dataset DEMO

| Entity | Jumlah |
|---|---:|
| Client / Project | 2 / 2 |
| Employee / Assignment | 6 / 6 |
| Outlet / Product | 6 / 6 |
| Attendance / Visit | 6 / 5 |
| Product Sales | 3 |
| Competitor / Product | 2 / 2 |
| Attendance Point | 1 |
| Leave / Outlet Stock | 3 / 6 |

Dua stock berada di bawah minimum. Leave berisi satu `pending`, `approved`, dan `rejected`.

Tenant nyata `ORG-MKB` aktif. Deployment gate memastikan akun Head nyata aktif dan synthetic UAT MKB tidak kembali.

## Audit dan perbaikan

Audit PR #36 menghasilkan **13 gap**. Seluruh Critical/High yang diketahui ditutup melalui PR #37/#38, meliputi retry idempotent, payload hash, revision race, tenant/actor isolation, role boundaries, shared relations, archive retention, status round-trip, schema health, dan auth-boundary smoke.

UAT production menemukan tambahan masalah provisioning/login superadmin, stale tenant, cache PWA, global bootstrap, serta data Demo. Perbaikannya berada di PR #39–#46.

Hotfix 23 Sep menegaskan invariant superadmin: identitas/role superadmin tetap global dan tidak memerlukan membership tenant, tetapi session login production/UAT harus terikat ke satu organisasi aktif yang valid. Tenant cache lama/stale tidak boleh memblokir login; server memilih workspace aktif yang valid dan superadmin tetap dapat berpindah ke organisasi aktif mana pun. Deployment menjalankan smoke login superadmin ephemeral sebelum release dinyatakan sehat.

## Risiko/temuan yang masih perlu diperhatikan

1. Full authenticated multi-role UAT masih perlu diulang untuk seluruh role dan viewport setelah P3, khususnya offline/reconnect serta report export.
2. Conflict dua perangkat sekarang blocked sampai keputusan eksplisit. UI saat ini menyediakan server-wins atau tinjau nanti; field-level merge/client-wins belum tersedia dan tidak boleh diotomatisasi.
3. Template dokumen, signature, dan riwayat file export client bersifat lokal by design; branding organisasi termasuk warna tema tidak lagi lokal.
4. `src/app.js` masih monolitik dan menjadi target maintainability berikutnya; pecah modul hanya setelah regression browser coverage memadai.
5. Inline executable JS sudah ditutup, tetapi inline style masih diizinkan oleh CSP untuk kompatibilitas UI saat ini.
6. PR #36 masih draft/divergen dan tidak boleh di-merge.
7. Technical logs boleh ada di console, tetapi toast/modal tidak boleh menyebut D1, R2, Worker, Cloudflare, GitHub, schema, atau stack trace.

## Production-ready gate

- Test, build, dry-run, dan migrasi dari database kosong lulus.
- CI PR dan deployment hijau.
- Health, security headers, auth boundary lulus.
- Login, tenant switch, bootstrap, dan referential checks production lulus.
- Smoke test seluruh role serta viewport mobile/desktop selesai.

## Runtime bootstrap baseline — 22 September 2026

Production browser startup sekarang memakai jalur eksplisit:

`index.html` → `src/entry.js` → `assets/logo.js` (branding only) + `src/bootstrap.js` → runtime modules → `src/app.js`.

Baseline P0:
- `src/bootstrap.js` adalah single source of truth untuk browser runtime graph.
- `src/cloud-cutover.js` tetap memasang cloud-first login/session, bootstrap D1, dan storage write-through.
- `src/m4-bootstrap.js` tetap memasang offline engine, evidence queue, offline login, dan registrasi service worker.
- Report core, Phase 4 report extensions, serta M6 client dimuat dari bootstrap yang sama.
- `window.__PROQTRACK_BOOT__` menyediakan status diagnostik `loading|ready|degraded` tanpa menampilkan istilah teknis ke UI.
- PWA cache baseline saat ini `proqtrack-v12.22`; precache hanya memasukkan application shell yang runtime-reachable dan assets.
- `assets/logo.js` tidak boleh lagi menjadi tempat import side-effect aplikasi.

Regression guard berada di `tests/runtime-bootstrap.test.mjs`.

## P1 hardening baseline — 22 September 2026

Enam temuan P1 audit ditutup pada baseline ini:

1. Stored competitor content di-escape saat render dan disanitasi saat write.
2. Password server memakai PBKDF2-HMAC-SHA256 `100000` iterations, yaitu ceiling kompatibel Cloudflare Workers production. Audit UAT 23 Sep menemukan `600000` menyebabkan login HTTP 500 di edge; guard runtime sekarang menolak stored work factor yang unsupported tanpa meledakkan request.
3. Repository tidak lagi menyimpan reusable superadmin/UAT recovery verifier; fresh bootstrap fail-closed.
4. Visit, attendance, dan leave memiliki lifecycle guard; record final tidak dapat diedit/dihapus langsung oleh field role.
5. ID baru menggunakan UUID dan cross-tenant ID collision ditolak sebelum sync/import mengubah revision.
6. Approval dan schedule report memakai M6 cloud API; state lokal hanya untuk presentation preference dan client export history.

Regression coverage berada di `tests/p1-hardening.test.mjs`. Baseline test setelah hardening: 196 PASS / 0 FAIL.

## P2 hardening baseline — 23 September 2026

Enam temuan P2 ditutup pada baseline ini:

1. `priceObservations`, `competitorIntel`, dan `outletProposals` menjadi cloud-authoritative melalui migrasi `0024`; evidence photo metadata dihydrate dari evidence authority.
2. Revision conflict tidak lagi auto-replay whole-device snapshot. Server state dihydrate dan snapshot lokal ditahan untuk review eksplisit.
3. Konfigurasi default Wrangler adalah satu-satunya target live; named `production` yang menunjuk resource berbeda dihapus.
4. Leaflet self-hosted, inline module bootstrap dipindah ke `src/entry.js`, dan CSP memisahkan executable scripts dari legacy event attributes.
5. Modul compatibility/UAT/report yang tidak direferensikan dihapus; service-worker registration hanya dari M4 bootstrap.
6. Build membuat precache dari runtime dependency graph, bukan seluruh source tree; fallback observer cache lokal turun dari 1 detik menjadi 5 detik.

Regression guard berada di `tests/p2-hardening.test.mjs`.

## P3 maintainability baseline — 23 September 2026

Empat kelompok maintainability debt ditutup pada baseline ini:

1. Seluruh active UI template berpindah dari executable `on*=...` attributes ke `data-pqt-on*` + delegated dispatcher `src/lib/ui-events.js`. Dispatcher memakai grammar terbatas dan tidak memakai `eval` atau `new Function`.
2. XLSX/DOCX/ZIP/PDF report export tidak lagi memuat JSZip/jsPDF dari CDN. Packaging dilakukan lokal melalui `src/lib/document-export.js`, sehingga executable CSP dapat menjadi self-only.
3. Snapshot offline yang mengalami revision conflict diberi `requiresReview` dan tidak dapat auto-replay pada reconnect/login berikutnya. User dapat mempertahankan salinan untuk review atau memilih versi server secara eksplisit.
4. Runtime bootstrap naik ke `p3-runtime-2026-09-23` dan service-worker cache ke `proqtrack-v12.22`.

CSP executable baseline: `script-src 'self'` dan `script-src-elem 'self'`; `script-src-attr 'unsafe-inline'` tidak lagi diperlukan.

Regression guard berada di `tests/p3-maintainability.test.mjs`. Baseline P3 awal: **210 PASS / 0 FAIL**; baseline setelah hotfix superadmin: **214 PASS / 0 FAIL**.


### Home production hardening — 24 Sep 2026
- Home memakai timezone organisasi aktif untuk boundary hari/bulan operasional.
- KPI stok Manager fail-closed ke project aktif.
- Home melakukan guarded cloud refresh setiap 45 detik, saat window kembali fokus, dan manual Refresh; refresh tidak menimpa local mutation yang belum sinkron.
- Legacy Phase 0 UI/data enhancer tidak lagi dimuat di production runtime; fake dashboard graph dan local branding writer dipensiunkan.
- Home activity diurutkan terbaru, action queue Supervisor diberi konteks, dan Track membawa fokus employee ke Last Location.
- Menu dashboard distandarkan menjadi Home dengan heading Organization/Project/Team Overview.
- PWA cache v12.21.


### Last Location P1 hardening — 24 Sep 2026
- Self check-in menangkap GPS perangkat (`checkInLat/checkInLng`), accuracy, capture timestamp, dan `locationSource=device_gps`; check-in milik sendiri membutuhkan GPS.
- Check-in administratif atas karyawan lain tidak pernah memakai GPS perangkat actor sebagai lokasi karyawan.
- Koordinat divalidasi sebagai pasangan atomik; outlet hanya fallback `outlet_reference` dan diberi label eksplisit bukan posisi perangkat.
- Evidence check-in dibuat immutable untuk field role setelah tercatat.
- Last Location menampilkan source, freshness, accuracy, dan status `belum check-out` tanpa klaim `masih di lokasi`.
- Last Location melakukan guarded cloud refresh setiap 30 detik, saat focus/visibility recovery, dan manual Refresh.
- Cloud visit authority memetakan UI `checked-in` ↔ D1 `in_progress`; GPS juga dinormalisasi ke `start_latitude/start_longitude` serta tetap tersimpan di metadata.
- PWA cache v12.22.


## Stabilization pass — 25 September 2026

Fokus sementara dialihkan dari pengembangan fitur baru ke konsistensi dan stabilitas lintas modul setelah rangkaian audit P0–P3.

- Stock correction chain mempertahankan basis penjualan asli pada koreksi berulang.
- Products dan Outlets melakukan authoritative refresh setelah sync sebelum UI dianggap final.
- Copy operasional Stock/Sales tidak lagi menampilkan istilah implementasi internal kepada user.
- Migration live terakhir adalah `0027_inventory_cycle_correction_uat.sql`.
- Service Worker cache baseline dinaikkan ke `proqtrack-v12.44` untuk memastikan shell terbaru menggantikan cache lama.
- Semua perubahan stabilisasi harus melewati full CI, build, migration-from-empty, dan Worker dry-run sebelum merge.
