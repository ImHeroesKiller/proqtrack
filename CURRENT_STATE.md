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


## Attendance + Leave P0 authority — 25 September 2026

P0 authority untuk Attendance dan Leave ditutup dengan prinsip cloud-authoritative dan project-scoped:

- Setiap project memiliki `attendanceSourceMode`: `manual` atau `visit`, serta `attendanceLateAfter` dengan default `09:00`.
- Attendance manual wajib terkait project dan assignment aktif; employee hanya dapat membuat attendance miliknya sendiri.
- Project dengan mode `visit` menolak direct attendance. Attendance harian dibuat idempotent dari check-in Visit yang lolos authority/geofence.
- Round-trip Attendance mempertahankan check-in/check-out time dan koordinat sehingga hydrate cloud tidak menghilangkan data UI.
- Leave baru selalu dipaksa `pending` oleh server; client tidak dapat menentukan approver atau timestamp approval.
- Approval/rejection Leave distempel dari session actor di server. Leave final immutable dan delete ditolak untuk menjaga audit trail.
- Overlap pengajuan Leave berstatus pending/approved diblokir.
- UI Attendance/Leave baru menyatakan sukses setelah sync dan authoritative refresh selesai.
- Regression guard: `tests/attendance-leave-p0.test.mjs`.


## Attendance + Leave P1 lifecycle — 25 September 2026

P1 memperkuat lifecycle, correction governance, validation, dan source consistency:

- Manual Attendance bersifat self-service hanya untuk hari berjalan, wajib berada dalam periode project dan assignment yang sesuai.
- Manual Attendance memiliki lifecycle check-in → satu kali check-out; check-out tidak dapat dimundurkan sebelum check-in atau diubah setelah final.
- Koreksi Attendance hanya untuk Manager/Supervisor/Admin pada source manual, wajib alasan minimal 10 karakter, dan menyimpan previous snapshot, actor, timestamp, serta correction count.
- Attendance turunan Visit tetap read-only. Completion Visit mengisi check-out Attendance turunan secara authoritative.
- Attendance manual maupun check-in Visit ditolak bila terdapat Leave approved pada tanggal tersebut.
- Leave pending dapat dibatalkan oleh pengaju tanpa delete; record disimpan sebagai rejected dengan metadata decisionKind=withdrawn untuk audit trail.
- Reviewer tidak dapat menyetujui/menolak Leave miliknya sendiri. Penolakan wajib memiliki decision note.
- Approval Leave ditolak bila sudah terdapat Attendance present/late pada periode yang diajukan.
- Employee dapat memperbarui Leave pending hanya sebelum periode mulai; final Leave immutable.
- Perubahan attendanceSourceMode Manual ↔ Visit diblokir bila Attendance hari berjalan sudah tercatat.
- Regression guard: `tests/attendance-leave-p1.test.mjs`.


## Attendance + Leave P2 operational hardening — 25 September 2026

P2 berfokus pada usability operasional tanpa mengubah authority P0/P1:

- Attendance Manager memiliki KPI operasional, filter karyawan/project/status/source/range tanggal, live result count, reset filter, dan filtered-empty state.
- Setiap Attendance memiliki detail operasional dan audit koreksi; source Visit tetap ditandai read-only.
- Leave queue memiliki filter status/type/range periode, live result count, filtered-empty state, dan aging indicator untuk pending >= 3 hari.
- Approval/rejection menampilkan ringkasan pengajuan sebelum keputusan dan dilindungi in-flight guard agar action tidak terkirim dua kali.
- Withdrawal employee menggunakan modal operasional, tetap mempertahankan audit trail, dan dilindungi duplicate-action guard.
- Employee dapat mengedit Leave pending selama periode belum dimulai; penyimpanan menunggu cloud authority sebelum sukses ditampilkan.
- Manual Attendance check-out memiliki in-flight duplicate guard dan friendly operational error mapping.
- My Attendance menampilkan label project yang lebih jelas; My Leave menampilkan Detail/Edit/Batalkan sesuai lifecycle.
- UI Attendance/Leave menggunakan responsive operational classes di `assets/ui-2026.css` untuk mobile dan desktop.
- Regression guard: `tests/attendance-leave-p2.test.mjs`.


## Attendance + Leave P3 maintainability — 25 September 2026

P3 menutup maintainability/refactor/quality backlog tanpa mengubah authority atau lifecycle P0–P2:

- Pure presentation/domain helper dipindahkan ke `src/lib/attendance-leave-ui.js`.
- Attendance source/status normalization, operational summary, filter snapshot/matching, time extraction, Leave display status, pending aging, summary, filter overlap, edit eligibility, dan friendly errors memiliki satu source of truth.
- `src/app.js` kembali fokus pada rendering dan orchestration cloud; filter/summary/error business rules tidak lagi tersebar di handler UI.
- `src/field-sales.js` menggunakan helper source/error yang sama dan `currentTenantTimeHHMM()` untuk check-in/check-out timezone handling.
- Regression P2 diubah agar menguji invariant helper, bukan bentuk implementasi lama di file monolitik.
- Attendance/Leave UI mengurangi inline-style debt dan menambah semantic button type, aria-live result count, serta reusable quality classes di `assets/ui-2026.css`.
- Pure unit coverage tersedia di `tests/attendance-leave-p3.test.mjs`.
- P0, P1, dan P2 regression suites tetap menjadi release gate.


## Settings P0 authority hardening — 25 September 2026

Empat P0 Settings ditutup dengan invariant production berikut:

- Admin tenant tidak dapat mengubah email/password global user melalui Account Management. Credential global hanya berubah melalui self-service Profile/Security pemilik account; attach-existing tetap mempertahankan credential lama.
- Revocation session akibat perubahan role/status account atau reset device dibatasi ke `organization_id` aktif sehingga membership/session user di tenant lain tidak ikut terputus.
- Settings → Attendance tidak lagi menyimpan policy Office/Outlet/Point lokal yang tidak dipakai server. UI mengubah `attendanceSourceMode` Manual/Visit dan `attendanceLateAfter` pada project melalui `commitOperationalChanges`; server tetap menolak source switch bila attendance hari ini sudah digunakan.
- Settings → Outlet Catalog disimpan dalam metadata project cloud (`modules.newOutlet` + `storeCatalog`). Browser `projectSettings` hanya legacy fallback untuk data lama dan bukan authority baru.
- Worker project mutation mempertahankan metadata existing saat patch parsial agar module/catalog/attendance settings tidak terhapus oleh update project lain.
- Regression guard: `tests/settings-p0.test.mjs`.


## Settings P1 operational/security hardening — 25 September 2026

P1 Settings menutup lima area setelah P0 authority:

- Profile cloud completeness: `auth_users.display_name` menjadi profile name authority global; self-service Profile menyimpan email, display name, phone, dan area. Phone/area untuk employee disimpan pada `core_employees` (area di metadata) dan response server menjadi sumber local mirror.
- Device authority: login/session/switch response membawa status binding server (`deviceBound`, label, paired/last-seen). Device tab tidak lagi memakai Device ID/fingerprint lokal sebagai authority, dan cloud-authenticated employee tidak dapat ditolak ulang oleh verifier device lokal.
- Display preferences: `compactTables`, badge Leave, dan badge Low Stock adalah preference UI lokal dan tidak lagi diblok oleh role ACL admin-only.
- Session controls: Settings menyediakan current-device logout dan logout-all; client memverifikasi response revoke server sebelum menyatakan sukses.
- Account UX/security: Account Management tidak mengubah credential global atau employee full name pada edit existing account; nama/email/password existing dikunci di form dengan arahan ke Profile/Security/Employee authority.
- Profile/password/session actions memiliki duplicate-submit guard dan error mapping yang lebih operasional.
- Migration: `0028_settings_p1_profile_identity.sql`; regression guard: `tests/settings-p1.test.mjs`.


## Settings P2 UX & operational hardening — 25 September 2026

P2 Settings menutup UX/operational backlog tanpa mengubah authority P0/P1:

- Destructive actions (logout semua perangkat, reset device, suspend account) memakai in-app confirmation modal; native `confirm()` di Settings dihapus.
- Semua form utama Settings memakai busy/disabled/aria-busy state yang konsisten untuk mencegah double-submit dan memberi feedback saat cloud action berjalan.
- Organization refresh dan Accounts refresh memiliki inline loading/error/last-sync state serta retry manual; auto-refresh hanya mencoba sekali per organization agar failure tidak menjadi toast/re-render loop.
- Accounts search di-debounce, focus dipulihkan setelah render, filter dapat di-reset, dan result count/empty state menjelaskan kondisi filter.
- Accounts desktop table berubah menjadi card-style rows pada mobile; action buttons wrap/stack dan tidak lagi bergantung pada raw local device fields.
- Settings tabs memakai tablist/tab/tabpanel semantics dan horizontal scrolling pada mobile.
- Copy Settings/Katalog/Accounts dirapikan ke Bahasa Indonesia; katalog tanpa project aktif memiliki empty state eksplisit.
- Regression guard: `tests/settings-p2.test.mjs`.


## Settings P3 maintainability/refactor & quality polish — 25 September 2026

P3 menutup maintainability backlog tanpa mengubah authority atau behavior P0–P2:

- Pure Settings presentation/policy helper dipindahkan ke `src/lib/settings-ui.js`: label role/status, frontend least-privilege role matrix, account action eligibility, error mapping, busy-state helper, confirmation markup, account filtering, tab composition, timezone/theme constants, dan logo byte helper.
- `src/account-settings.js` kembali fokus pada rendering dan cloud orchestration; runtime CSS injection, duplicate role/error helpers, duplicate tab construction, dan manual account filtering dihapus.
- CSS Settings dipindahkan ke `assets/settings.css` dan dimuat statis dari `index.html`, sehingga responsive/mobile polish tidak lagi tertanam dalam JavaScript.
- Frontend role matrix tetap presentation-only; server `worker/accounts.js` tetap menjadi authority. P3 regression mengunci agar helper UI tidak memberi privilege melebihi hierarchy server.
- Account filtering dan Settings tab composition memiliki pure unit coverage untuk memudahkan refactor berikutnya.
- Regression P0–P2 diperbarui agar menguji invariant lintas module setelah extraction, bukan bergantung pada bentuk monolitik lama.
- Regression guard: `tests/settings-p3.test.mjs`.

## Performance P0 — production hot-path hardening — 25 September 2026

P0 performance menutup hot-path utama untuk menjaga ProQTrack tetap cepat/stabil saat volume tenant bertambah, tanpa memperluas authority:

- Refresh Home/Visits/Last Location memakai revision-aware bootstrap. Bila `core_sync_state.revision` belum berubah, Worker mengembalikan `notModified` sebelum membaca 22 kelompok data operasional sehingga polling tidak melakukan full tenant hydrate atau full-page rerender tanpa perubahan.
- Bootstrap Manager/Supervisor/Employee melakukan D1 query scoping berdasarkan project dan employee authority sebelum decode; broad role Superadmin/Head/Admin tetap memperoleh workspace organisasi sesuai kewenangannya. Post-decode defense-in-depth filtering tetap dipertahankan.
- Visits, Employees, Outlets, dan Products memakai true active-page DOM pagination. Filter bekerja terhadap cached row models dan hanya baris halaman aktif yang masuk ke `tbody`, bukan membuat seluruh ribuan row lalu menyembunyikannya.
- Hot aggregate CPU dikurangi: employee monthly sales dihitung sekali per render, outlet visit count/last visit dibuat single-pass, dan product operational reference count dibuat single-pass.
- Offline operational snapshot berubah dari polling/parsing localStorage setiap 5 detik menjadi event-driven melalui `proqtrack:db-persisted`; online/visibility tetap menyediakan recovery observation.
- Legacy `proqtrack_db_v7` mirror ditunda/coalesced pada browser idle path, sementara primary `proqtrack_db_v6` tetap ditulis sinkron untuk local authority/offline safety.
- Service Worker tidak lagi memakai fixed release cache sebagai runtime key. Build membuat SHA-256 content release dan mengganti `__PROQTRACK_RELEASE__`, sehingga shell/index/module satu deploy berada dalam cache atomik yang sama dan browser tidak mencampur asset antar-release.
- Private `/api/` tetap tidak pernah dicache Service Worker.
- Regression guard utama: `tests/performance-p0.test.mjs`, dengan update pada runtime/offline/product regression contracts agar mengunci behavior baru, bukan implementasi hot-path lama.


## Performance P1 — startup, lazy runtime & evidence rendering — 25 September 2026

P1 performance memindahkan pekerjaan non-kritis keluar dari startup/login path dan membatasi hydration/rendering media berat:

- Critical bootstrap sekarang hanya memuat UI event authority, seed compatibility, cloud cutover, offline runtime, M6 client, dan `app.js`. Project Management dan Reports baru dimuat ketika route terkait dibuka; cosmetic/secondary enhancers dimuat bertahap pada browser idle setelah user authenticated.
- Leaflet CSS/JS dihapus dari `index.html`. Runtime peta memakai `src/lib/leaflet-loader.js` dan baru memuat Leaflet saat Last Location/Tracking atau outlet map benar-benar dibuka; polling `setTimeout(initMap, 200)` dihapus.
- Evidence client + field-photo evidence bridge tidak lagi menjadi static import M4 startup. Runtime evidence diprime saat idle/online atau ketika user berinteraksi dengan input evidence.
- Cloud bootstrap tidak lagi menunggu pagination metadata evidence sebelum status `ready`; metadata evidence dihydrate terpisah saat idle dan on-demand saat halaman Field Photos/My Photos dibuka, dengan token/tenant guard.
- IndexedDB evidence queue menggunakan index `organization_status` untuk mengambil pending/failed record dan menghitung queue tanpa membaca seluruh record/blob hanya untuk status count.
- Field Photos merender batch awal 24 item, thumbnail memakai native lazy loading + async decoding, dan menyediakan `Muat lebih banyak`; filter mereset visible window.
- Evidence preview object URL hanya dibuat jika preview benar-benar ditampilkan dan selalu direvoke setelah load/error.
- Long-lived document-wide `MutationObserver` di Project Management dan Reports dihapus menjadi event-driven; startup branding observer diputus setelah bootstrap; legacy visual observer dibatasi ke `#app` dan disconnect saat `pagehide`.
- Regression guard utama: `tests/performance-p1.test.mjs`, plus pembaruan kontrak runtime/CSP/maintainability yang sebelumnya mengunci eager Leaflet dan runtime version lama.
