# Milestone 4 — Offline First + R2 Evidence

## Goal

Make field execution resilient to intermittent mobile connectivity without changing the source of truth introduced in Milestone 3.

Authoritative flow remains:

`UI / local cache -> IndexedDB durable queue -> authenticated Worker -> D1 / R2`

D1 remains authoritative for operational records. R2 stores binary field evidence. IndexedDB is a temporary durable transport and offline cache, not a second server database.

## Offline operational outbox

The browser observes the existing operational cache and persists only these collections to the M4 outbox:

- clients
- projects
- employees
- projectAssignments
- outlets
- visits
- attendance
- products
- productSales
- surveyTemplates
- surveyResponses
- projectProducts

Accounts, passwords, device secrets, API tokens, and session credentials are not copied into the durable operational outbox.

The outbox is coalesced by tenant. Repeated local changes replace the tenant's pending operational snapshot rather than generating an unbounded queue.

On reconnect or when the cloud session becomes ready, the pending snapshot is replayed through the existing M3 `/api/core/sync` path. Server authorization is therefore evaluated again during replay.

## Revision conflicts

When M3 returns `REVISION_CONFLICT`, M4 records a receipt in `core_sync_conflicts`, fetches the latest D1 bootstrap, reapplies the pending operational snapshot, and schedules a fresh sync against the new revision.

The receipt stores client revision, server revision, actor, mutation ID, resolution strategy, and timestamp.

## Cold-start offline login

Offline login is intentionally restricted.

It is available only when all conditions are true:

1. the browser reports offline;
2. the workspace has previously completed D1 cutover;
3. the local account has `cloudIdentity=true`, proving it was previously reconciled with a successful server session;
4. local password/device authentication succeeds;
5. the local account is active.

An offline session clears the API bearer token and cannot mint server authority. It never enrolls or marks a new privileged device. When connectivity returns, the user must regain a normal server session before queued changes or evidence can be sent.

## R2 evidence

M4 introduces a dedicated `/api/evidence` surface. It does not enable the legacy `/api/files` endpoint.

Upload flow:

1. field photo is saved as a Blob in IndexedDB;
2. UI can show an immediate object-URL preview;
3. when online and server-authenticated, the Blob is POSTed to `/api/evidence`;
4. Worker revalidates organization, project, employee/team, outlet, and visit scope;
5. Worker validates JPEG/PNG/WebP from magic bytes;
6. Worker computes SHA-256;
7. binary is stored under the tenant/project R2 prefix;
8. normalized metadata is written to `core_field_evidence`;
9. the local Blob is released after a successful receipt.

Evidence upload uses the evidence ID as an idempotency key. Replaying the same ID with the same hash is safe. Reusing the ID with different bytes returns a conflict.

If R2 succeeds but the D1 metadata insert fails, the Worker attempts to delete the R2 object so an orphaned evidence object is not intentionally left behind.

## Evidence authorization

Evidence remains private. Binary reads require the same authoritative bearer authentication as other protected APIs.

- Head/Admin/Superadmin: organization-wide project access according to authoritative role policy.
- Manager: only projects in authoritative project scope.
- Supervisor: own employee or employees assigned to that supervisor inside an allowed project.
- Employee: own employee identity inside an allowed project.

Server checks are applied again at upload/read time; browser metadata is never the authority.

## Service worker

`sw.js` v4 precaches the application shell and offline modules.

Rules:

- `/api/*` is never intercepted or cached;
- navigation is network-first with cached app-shell fallback;
- static same-origin assets can use cached copies and refresh from network;
- authenticated evidence responses are not cached by the service worker.

## Database migration 0008

Migration `0008_offline_r2_evidence.sql` adds:

- evidence uploader metadata;
- evidence idempotency key;
- evidence row version/update timestamp;
- tenant evidence lookup indexes;
- `core_sync_conflicts` audit table.

The migration is additive. No legacy table is dropped and the legacy file API remains disabled.

## Operational verification

Before merge:

- apply all D1 migrations locally;
- run full test suite including `m4-offline-evidence.test.mjs`;
- run static build;
- run Wrangler dry-run.

After merge:

1. apply migration 0008 remotely before Worker deployment;
2. deploy Worker/assets;
3. verify `/api/health`;
4. verify unauthenticated `/api/evidence` is rejected;
5. perform authenticated field UAT for online upload, airplane-mode capture, reconnect replay, duplicate replay, and multi-device conflict recovery.

## Explicit non-goals

M4 does not make IndexedDB authoritative, does not store long-lived server credentials for background sync, does not make evidence public, and does not unlock legacy snapshot/file APIs.
