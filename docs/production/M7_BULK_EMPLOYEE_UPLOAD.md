# M7 Bulk Employee Upload

## Purpose

Production-safe bulk employee onboarding for the active organization. This feature replaces the retired legacy browser import workflow; it must not call `/api/core/import`.

## Supported files

- CSV (comma, semicolon, or tab delimited)
- XLSX, first worksheet
- Maximum 500 data rows per selected file
- Browser preview chunks: 100 rows
- Commit chunks: 20 rows

The raw file remains in the browser. Only normalized row JSON is sent to the API.

## Template columns

`employee_code, full_name, email, phone, role, area, position, project_code, supervisor_email, status, create_login`

Required:
- employee_code
- full_name
- project_code
- email when create_login = YA

Role aliases such as SPG, Merchandiser, Sales, Field Sales and Agent normalize to employee. Supervisor normalizes to supervisor. Bulk upload cannot provision Head, Admin, Manager or Superadmin roles.

## Server validation

Every commit repeats preview validation against authoritative D1:
- active organization and actor permission
- project exists and remains in actor scope
- duplicate employee code/email inside the file
- email is not owned by another employee
- supervisor is an active authorized organization member
- an existing employee cannot be silently relinked to another login identity
- privileged existing accounts are never claimed by bulk onboarding

## Login provisioning

When `create_login=YA`:
- existing active ordinary login can be linked when safe
- new login receives a strong randomly generated initial password
- the password is PBKDF2-hashed before D1 storage
- plaintext initial passwords are returned only in the successful commit response
- audit tables never store plaintext credentials
- the UI offers a one-time credential CSV download after the full file succeeds

## Reliability

- client import id + chunk id protect completed chunks from duplicate replay
- employee and assignment writes are upsert/idempotent
- `core_sync_state.revision` increments after each committed chunk
- browser re-bootstrap hydrates authoritative D1 after completion
- `core_bulk_import_runs` and `core_bulk_import_chunks` keep non-sensitive audit metadata

If a later chunk fails, earlier completed chunks remain safe. Re-uploading the source file updates/reconciles those rows instead of creating duplicate employee codes.
