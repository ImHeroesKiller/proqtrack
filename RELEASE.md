# Release and Production Runbook

Dokumen ini adalah prosedur resmi untuk merilis ProQTrack. Utamakan stabilitas `main`; fitur tambahan boleh ditunda apabila belum melewati seluruh gate.

## Alur rilis resmi

1. Buat branch pendek dari `origin/main` terbaru.
2. Implementasikan perubahan dalam scope kecil dan dapat di-rollback.
3. Buka pull request non-draft; jangan push atau force-push langsung ke `main`.
4. Tunggu seluruh CI wajib lulus dan lakukan review perubahan, migrasi, serta dampak tenant/role.
5. Merge dengan squash setelah checklist siap.
6. Catat commit/deployment sehat terakhir sebagai recovery point.
7. Untuk perubahan schema, jalankan migrasi pada binding yang benar sebelum kode yang bergantung padanya aktif.
8. Deploy Worker dari commit `main` yang sudah tervalidasi.
9. Jalankan smoke test dan UAT terautentikasi.

## Target live saat ini

> **Peringatan:** deployment live saat ini menggunakan konfigurasi default Wrangler (`--env=""`), D1 `proqtrack-mvp`, dan R2 `proqtrack-mvp-files`.

Named environment `production` di `wrangler.jsonc` menggunakan resource berbeda. Jangan menjalankan `npm run deploy:production`, `wrangler deploy --env production`, atau migrasi `--env production` untuk live tanpa keputusan migrasi environment yang eksplisit, backup, dan UAT lengkap.

Perintah target live yang berlaku:

```bash
npm run build
npx wrangler d1 migrations apply DB --remote --env=""
npx wrangler deploy --env=""
```

Periksa binding dan output dry-run sebelum menjalankan perintah remote. Jangan menebak target dari nama script.

## Checklist sebelum merge

- [ ] Scope PR kecil, jelas, dan bukan kelanjutan draft PR #36.
- [ ] Tidak ada secret, token, password, dump data, `.dev.vars`, `.wrangler/`, atau artefak build di commit.
- [ ] `git diff --check` bersih.
- [ ] `npm test` lulus.
- [ ] `npm run build` lulus.
- [ ] `npx wrangler deploy --dry-run --env=""` lulus dan binding sesuai target live.
- [ ] Perubahan schema dapat diterapkan dari database kosong dan database yang sudah berisi data.
- [ ] Test baru mencakup happy path, validasi, tenant isolation, role, dan conflict/revision bila relevan.
- [ ] Superadmin, admin, leader, dan employee diperiksa sesuai dampak perubahan.
- [ ] Asset/version service worker dinaikkan jika shell aplikasi atau kontrak cache berubah.
- [ ] Dokumentasi root diperbarui bila arsitektur, prosedur, atau batasan berubah.

## Aturan migrasi D1

- Migrasi bersifat maju, additive bila memungkinkan, berurutan, dan idempotent terhadap retry operasional.
- Jangan mengedit migrasi yang sudah pernah diterapkan di production. Buat file migrasi baru.
- Tabel tenant harus menyimpan dan memvalidasi `organization_id`; referensi lintas entitas harus tetap berada dalam organisasi yang sama.
- Jangan mengandalkan seed/demo record untuk membuat schema valid.
- Guard organisasi MKB harus tetap aktif: database production tidak boleh menerima data sintetis untuk MKB melalui bootstrap atau seed otomatis.
- Uji seluruh migrasi dari database lokal kosong, lalu jalankan test aplikasi.

## Gate otomatis minimum

Pipeline rilis harus menolak perubahan bila salah satu berikut gagal:

- secret scan dan dependency audit;
- automated tests dan production build;
- Wrangler dry-run serta pemeriksaan binding;
- migrasi database kosong;
- pemeriksaan recovery point;
- health/schema check;
- autentikasi superadmin dan isolasi tenant;
- guard organisasi MKB;
- security headers dan CSP;
- endpoint privat dapat diakses tanpa autentikasi.

## UAT setelah deploy

Jalankan setidaknya:

1. Buka aplikasi di private window dan pastikan shell terbaru termuat.
2. Login dengan akun UAT aktif; jangan menaruh kredensial di dokumentasi atau tiket.
3. Verifikasi bootstrap selesai tanpa `409`, `403`, atau retry loop.
4. Periksa role yang terdampak dan pastikan data organisasi lain tidak terlihat.
5. Verifikasi Employees, Outlets, Products, Product Sales, Outlet Stock, Attendance, Leave, dan Competitors sesuai scope.
6. Untuk Leave dan Outlet Stock, pastikan ringkasan dan baris tabel konsisten setelah reload.
7. Uji create/update/delete yang berubah, duplicate submission, dan stale revision/conflict.
8. Pastikan offline/reconnect tidak menggandakan data dan tidak menampilkan data lama sebagai authoritative.
9. Periksa console serta network untuk error aplikasi; source-map CDN yang diblokir CSP tidak boleh mengubah alur utama, tetapi tetap dicatat sebagai risiko teknis.

## Rollback

### Kode

- Identifikasi deployment sehat terakhir dan commit sumbernya.
- Rollback/redeploy commit tersebut melalui pipeline; jangan memperbaiki langsung di production.
- Setelah rollback, ulangi health check, login, bootstrap, dan alur yang memicu insiden.

### Data

- Jangan menjalankan `DROP`, truncate, mass update, atau restore tanpa backup dan persetujuan eksplisit.
- Migrasi maju lebih aman daripada mencoba menghapus migrasi yang sudah diterapkan.
- Jika kontrak kode lama tidak kompatibel dengan schema baru, siapkan compatibility patch sebelum rollback kode.

## Handoff rilis

Catatan rilis harus memuat commit/PR, target binding, migrasi yang diterapkan, hasil CI, hasil UAT per role, recovery point, known issues, dan keputusan go/no-go. Status “deployment sukses” saja belum cukup untuk menyatakan siap produksi.
