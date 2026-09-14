# Milestone 3 — Operational API & Data Migration

## Goal

Move operational records from browser-local source-of-truth to authoritative Cloudflare D1 while preserving the existing ProQTrack UI during cutover.

After a tenant reaches `cloud` mode:

- D1 is the authoritative operational store.
- Browser localStorage is a compatibility cache only.
- Every protected API request is authorized by the Milestone 2 server session and current D1 memberships.
- Existing local mutations are written through to `/api/core/sync`.
- A browser reset can recover operational data again after server login.

## Covered operational domains

- Clients
- Projects
- Employees
- Project assignments
- Outlets
- Visits
- Attendance
- Products
- Product sales
- Survey templates
- Survey responses
- Project/product mappings

Field evidence/files remain a Milestone 4 R2 cutover item.

## Cutover sequence

1. User authenticates through the server-authoritative M2 login.
2. Client calls `GET /api/core/bootstrap`.
3. If D1 is empty and the tenant is still `pending`, only Head/Admin/Superadmin may perform the first import.
4. The browser snapshot is canonicalized and dry-run validated.
5. Import creates normalized tenant-scoped rows and server memberships.
6. `core_sync_state.cutover_mode` changes to `cloud` and revision increments.
7. Browser hydrates operational collections from D1.
8. Subsequent `saveDB()` writes update the local cache immediately and are synchronized to D1 through revisioned, idempotent mutations.

## Concurrency and duplicate protection

Each tenant has a monotonic revision in `core_sync_state`.

Every sync request includes:

- `mutationId`
- `baseRevision`
- one or more entity changes

`core_sync_mutations` makes a repeated mutation idempotent. A stale `baseRevision` returns `REVISION_CONFLICT`; the client does not silently overwrite newer D1 data.

Milestone 4 will add a durable IndexedDB outbox and automatic offline conflict recovery. M3 intentionally does not pretend localStorage is a reliable offline queue.

## Security boundary

The browser never supplies authoritative tenant/role/project claims.

Before `/api/core/*` is processed, the Worker revalidates:

- signed server session
- D1 session status and expiry
- current user status
- organization membership
- current role
- project/client scope

Operational writes are checked again per entity and employee/project scope.

## Compatibility boundary

D1 keeps normalized statuses while the existing UI remains backward-compatible:

- `on_hold` ↔ `paused`
- `completed` ↔ `closed`
- assignment `removed` ↔ `ended`

Legacy values are retained as compatibility metadata where needed.

## First-production-login checklist

Use a Head/Admin/Superadmin browser that contains the intended current operational dataset.

Confirm before login:

- correct organization selected
- browser local dataset is the intended migration source
- no known duplicate IDs
- server login is available

After login, confirm:

- cloud-session login succeeds
- import dry-run passes
- tenant reaches `cloud`
- dashboard counts match the pre-cutover browser dataset
- clients/projects/employees/outlets/visits/attendance/sales are present
- a test update survives browser reload
- a second authorized desktop/browser sees the same D1-backed data

## Recovery rules

If import validation fails, tenant remains `pending`; fix the source data before retrying.

If synchronization reports `REVISION_CONFLICT`, do not force-write the stale cache. Reload/re-authenticate and hydrate from D1 before repeating the intended action.

If D1/API is unavailable after a tenant is known to be cut over, the app must not silently treat local cached data as authoritative. The local cache may remain visible, but writes should not be considered safely synchronized until the server confirms them.

## Exit criteria

Milestone 3 is code-complete only when:

- migration 0007 passes locally and remotely
- full tests pass
- build passes
- Wrangler bundle validation passes
- Worker deploy succeeds after migration
- live API health check passes

Tenant data cutover itself completes on the first qualifying authenticated browser login because the legacy source dataset exists in browser localStorage, not in the Git repository or CI environment.
