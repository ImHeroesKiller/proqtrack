# Development Instructions

File ini adalah pintu masuk wajib bagi developer dan coding agent yang bekerja di repository ProQTrack.

## Baca sebelum mengubah kode

Urutan referensi:

1. `README.md` — gambaran produk, arsitektur, dan perintah dasar.
2. `CURRENT_STATE.md` — baseline production, temuan audit, dan risiko tersisa.
3. `DEVELOPMENT.md` — pola implementasi dan batasan teknis.
4. `SECURITY.md` — aturan autentikasi, tenant, secret, dan data.
5. `RELEASE.md` — gate, target live, deployment, UAT, dan rollback.

Dokumen root di atas adalah source of truth. Dokumen milestone/historis hanya konteks dan tidak boleh mengalahkan kondisi aktual di root.

## Batasan yang tidak boleh dilanggar

- Stabilitas `main` lebih penting daripada mengaktifkan seluruh fitur sekaligus.
- Semua perubahan masuk melalui branch dan pull request dengan CI hijau. Jangan push/force-push langsung ke `main`.
- Jangan merge atau memakai draft PR #36 sebagai basis. Gunakan `main`; implementasi stabil bulk master dan competitor authority berasal dari PR #37/#38 dan hardening sesudahnya.
- Target live saat ini adalah Wrangler default `--env=""`, bukan named environment `production`. Jangan mengganti target/binding tanpa rencana migrasi terpisah.
- Jangan mengubah migrasi D1 yang sudah diterapkan. Tambahkan migrasi baru dan uji dari database kosong.
- Jangan commit credential, password standar, token, `.dev.vars`, dump database, `.wrangler/`, atau artefak hasil build.
- Jangan melemahkan autentikasi, role check, tenant isolation, referential integrity, optimistic revision, CSP, atau security headers demi membuat test lulus.
- Jangan menjadikan `localStorage`, IndexedDB, atau service-worker cache sebagai authority bagi koleksi cloud-authoritative.
- Jangan cache respons `/api/*` di service worker.
- Jangan menampilkan istilah infrastruktur seperti D1, Cloudflare, Worker, R2, GitHub, binding, migration, atau revision pada popup/toast pengguna. Tampilkan bahasa bisnis dan simpan detail teknis di log terkontrol.
- Jangan membuat seed otomatis untuk organisasi MKB di production.

## Saat menambah atau mengubah koleksi data

- Ikuti checklist cloud-authoritative lengkap di `DEVELOPMENT.md`.
- Terapkan `organization_id` dan scope semua query dari session server, bukan input klien.
- Validasi referensi induk dan kepemilikan tenant pada server.
- Tentukan idempotency, duplicate submission, delete behavior, dan conflict/revision sebelum membuat UI.
- Update bootstrap, CRUD API, client store, mutation queue, reset/logout, test, dan dokumentasi sebagai satu kontrak.

## Verifikasi wajib

Jalankan dari root repository:

```bash
git diff --check
npm test
npm run build
npx wrangler deploy --dry-run --env=""
```

Jika schema/data berubah, tambahkan uji migrasi database kosong dan verifikasi terhadap target binding yang benar. Jika auth, role, tenant, offline sync, atau service worker berubah, lakukan UAT browser yang relevan sebelum merge.

## Kewajiban dokumentasi

Perbarui dokumentasi root dalam PR yang sama jika perubahan memengaruhi arsitektur, source of truth data, role/permission, kontrak API, target deployment, prosedur migrasi, risiko, atau gate rilis. Jangan membiarkan dokumentasi menyatakan kondisi yang belum benar-benar aktif di `main` dan production.
