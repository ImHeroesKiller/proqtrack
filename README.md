# ProQTrack

ProQTrack adalah aplikasi operasional field force untuk outsourcing, sales, merchandising, dan audit lapangan. Production berjalan sebagai Cloudflare Worker dengan D1 sebagai sumber data operasional utama dan R2 untuk bukti/file.

**Production:** https://proqtrack.arywibowo.workers.dev

**Repository:** https://github.com/ImHeroesKiller/proqtrack
**Baseline dokumentasi:** 22 September 2026, setelah PR #46

## Mulai dari sini

Developer dan coding agent wajib membaca dokumen root berikut:

1. [CURRENT_STATE.md](CURRENT_STATE.md) — kondisi production, fitur, audit, dan risiko.
2. [DEVELOPMENT.md](DEVELOPMENT.md) — arsitektur, data authority, aturan dan batasan.
3. [SECURITY.md](SECURITY.md) — autentikasi, tenant isolation, secret, dan upload.
4. [RELEASE.md](RELEASE.md) — testing, migrasi, deployment, UAT, dan rollback.
5. [AGENTS.md](AGENTS.md) — instruksi wajib untuk coding agent.

Dokumen milestone di `docs/production/` bersifat historis. Jika bertentangan, dokumen root adalah acuan terbaru.

## Kondisi singkat

- Production aktif; login cloud, session, multi-organization, dan role enforcement berjalan.
- Data operasional utama menggunakan D1 dan cache browser untuk performa/offline terbatas.
- Organisasi `DEMO` memiliki dataset saling terhubung untuk UAT.
- Bulk master mendukung preview, validasi, chunk idempotent, dan revision guard.
- Leave dan Outlet Stock cloud-authoritative sejak migrasi `0023`.
- Service Worker baseline `proqtrack-v12.5`.
- Automated test baseline: **187 passing**.

## Fitur utama

- Organization, Client, Project, Employee, Assignment
- Outlet, Product, Stock, Product Sales
- Attendance, Leave, Visit, tracking
- Survey dan aktivitas field
- Competitor, Competitor Product, Attendance Point
- Evidence/foto, reporting, workflow, analytics, audit, export
- Bulk Employee dan multi-entity master
- Role: Superadmin, Head/Admin, Manager, Supervisor, Employee

## Menjalankan lokal

Prasyarat: Node.js 22 dan npm.

```bash
npm ci
npm test
npm run build
python3 -m http.server 8080
```

Perintah utama:

```bash
npm run check
npm run db:migrate:local
```

Jangan menjalankan migrasi remote atau deploy production manual tanpa mengikuti [RELEASE.md](RELEASE.md).

## Secret dan akun

- Password, bearer token, API token, dan secret tidak boleh masuk source, dokumentasi, issue, PR, atau log.
- Password UAT diperoleh dari pemilik sistem melalui kanal aman.
- `API_AUTH_SECRET` dan credential Cloudflare hanya disimpan melalui secret manager/GitHub Environment.

## Branch dan deployment

- `main` adalah branch production dan wajib melalui Pull Request.
- Push ke `main` memicu CI dan deployment.
- Workflow live menggunakan binding default `--env=""`: D1 `proqtrack-mvp`, R2 `proqtrack-mvp-files`.
- Named environment `production` di `wrangler.jsonc` menunjuk resource berbeda. Jangan mengganti target tanpa rencana migrasi.

## Status PR #36

PR #36 tetap draft dan **tidak boleh di-merge**. Implementasi stabil dilanjutkan melalui PR #37/#38; hardening production berikutnya melalui PR #39–#46. Tutup/arsipkan PR #36 setelah memastikan tidak ada commit unik yang dibutuhkan.
