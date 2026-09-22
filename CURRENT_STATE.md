# Current Production State

Snapshot kondisi pada **22 September 2026**, setelah PR #46. Perbarui dokumen ini jika arsitektur, resource, milestone, risiko, atau baseline test berubah.

## Baseline

| Area | Kondisi |
|---|---|
| URL | `https://proqtrack.arywibowo.workers.dev` |
| Runtime | Cloudflare Worker + static assets |
| D1 live | binding `DB` → `proqtrack-mvp` |
| R2 live | binding `FILES` → `proqtrack-mvp-files` |
| Milestone config | `M7` |
| Service Worker | `proqtrack-v12.5` |
| Migrasi terakhir | `0023_cloud_leaves_stocks.sql` |
| Test baseline | 187 passing |
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

Daftar client di `CLOUD_COLLECTIONS` (`src/lib/cloud-data.js`) dan daftar server di `ENTITY_COLLECTIONS`/`ENTITY_TABLES` (`worker/operations.js`) harus selalu konsisten.

Browser hanya cache/compatibility layer saat organisasi sudah `cutover_mode='cloud'`. `proqtrack_db_v6` adalah key utama; `proqtrack_db_v7` mirror. Approval laporan dan report schedule sudah cloud-authoritative. Template/branding dokumen dan riwayat file export client tetap lokal sebagai presentation/device preference, bukan workflow authority.

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

## Risiko/temuan yang masih perlu diperhatikan

1. Full multi-role UAT perlu diulang setelah migrasi `0023`.
2. Offline conflict recovery perlu diuji dengan dua device.
3. Template/branding dokumen dan riwayat file export client bersifat lokal by design; approval dan jadwal laporan sudah server-authoritative.
4. Leaflet CDN adalah dependency eksternal runtime.
5. Named environment berbeda dari target workflow live; salah `--env` dapat memakai database lain.
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

`index.html` → `assets/logo.js` (branding only) → `src/bootstrap.js` → runtime modules → `src/app.js`.

Baseline P0:
- `src/bootstrap.js` adalah single source of truth untuk browser runtime graph.
- `src/cloud-cutover.js` tetap memasang cloud-first login/session, bootstrap D1, dan storage write-through.
- `src/m4-bootstrap.js` tetap memasang offline engine, evidence queue, offline login, dan registrasi service worker.
- Report core, Phase 4 report extensions, serta M6 client dimuat dari bootstrap yang sama.
- `window.__PROQTRACK_BOOT__` menyediakan status diagnostik `loading|ready|degraded` tanpa menampilkan istilah teknis ke UI.
- PWA cache baseline dinaikkan ke `proqtrack-v12.6` agar client lama mengambil entry graph baru.
- `assets/logo.js` tidak boleh lagi menjadi tempat import side-effect aplikasi.

Regression guard berada di `tests/runtime-bootstrap.test.mjs`.

## P1 hardening baseline — 22 September 2026

Enam temuan P1 audit ditutup pada baseline ini:

1. Stored competitor content di-escape saat render dan disanitasi saat write.
2. Password server memakai PBKDF2-HMAC-SHA256 work factor `600000`; hash lama di-upgrade setelah login sukses.
3. Repository tidak lagi menyimpan reusable superadmin/UAT recovery verifier; fresh bootstrap fail-closed.
4. Visit, attendance, dan leave memiliki lifecycle guard; record final tidak dapat diedit/dihapus langsung oleh field role.
5. ID baru menggunakan UUID dan cross-tenant ID collision ditolak sebelum sync/import mengubah revision.
6. Approval dan schedule report memakai M6 cloud API; state lokal hanya untuk presentation preference dan client export history.

Regression coverage berada di `tests/p1-hardening.test.mjs`. Baseline test setelah hardening: 196 PASS / 0 FAIL.
