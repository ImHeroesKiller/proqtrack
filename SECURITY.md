# Security Policy and Boundaries

## Secret management

- Tidak ada plaintext password, bearer/API token, private key, atau credential dalam repository.
- `API_AUTH_SECRET` minimal 32 karakter dan dikelola sebagai Worker secret.
- GitHub Actions membaca secret hanya dari GitHub Environment/Repository Secrets.
- Jangan log Authorization header, password input/hash material, atau full session payload.
- Jangan membuat fallback secret di source.

## Authentication

- Token hanya melalui `Authorization: Bearer`; query-string token tidak didukung.
- Role berasal dari database server, bukan body request/localStorage.
- Session memiliki TTL dan dapat dicabut.
- Rate limit login dan endpoint sensitif dipertahankan.
- Password tidak ditampilkan di halaman login/dokumentasi publik.

## Tenant isolation dan authorization

- Seluruh query operational difilter `organization_id`.
- Manager/Supervisor/Employee dibatasi claims project dan employee access.
- Global superadmin tidak membaca operational data sebelum memilih organisasi.
- Preview bulk menerapkan validasi yang konsisten dengan commit.
- Commit bulk memakai jalur sync authoritative dengan revision/idempotency guard.

## Input/output

- SQL menggunakan parameter binding.
- Data pengguna di HTML wajib di-escape; hindari `innerHTML` dengan input mentah.
- Upload dibatasi size, MIME allowlist, category, dan authorization.
- Storage key dibuat/sanitasi server.
- API tidak membocorkan SQL, stack trace, secret, atau internal identifier.

## Browser/PWA boundaries

- localStorage/cache bukan security authority.
- UI role visibility bukan pengganti Worker authorization.
- Service Worker tidak menyimpan response authenticated `/api/*`.
- Device binding browser bukan hardware attestation.
- CSP dan security headers tidak dilonggarkan tanpa threat review.

## Recovery

- Workflow merekam D1 Time Travel bookmark sebelum migrasi/deploy.
- Migrasi wajib additive dan diuji dari database kosong.
- Jangan drop/rename tabel tanpa backup, compatibility phase, dan rollback plan.
- Saat insiden, simpan request ID/waktu tanpa token dan evaluasi blast radius sebelum restore.

Kerentanan yang berisi exploit, credential, atau data pengguna harus dilaporkan privat kepada pemilik repository, bukan melalui issue publik.
