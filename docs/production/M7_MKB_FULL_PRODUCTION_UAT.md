# Milestone 7 — Full Production UAT & Go-Live Readiness

## Tenant

- Organization: **Mitra Kreasi Bersama (MKB)**
- Organization ID: `ORG-MKB`
- Client: `MKB FMCG Principal (UAT)` — synthetic/non-billable
- Project: `MKB FMCG Sales & Merchandising UAT`
- Project ID: `PRJ-MKB-SALES-UAT`
- Runtime: production Worker + production D1/R2 path currently serving ProQTrack

This UAT tenant is isolated from the existing tenant. All test master data is marked synthetic. No plaintext password is stored in migrations or source code.

## Personas

| Persona | Login identity | Surface | Core responsibility |
| --- | --- | --- | --- |
| Head | `head@proqtrack.id` | Desktop | executive review, report publication approval |
| Manager | `manager-re@proqtrack.id` | Desktop | project monitoring, approval, analytics |
| Supervisor Sales | `rizky.pratama@proqtrack.id` | Mobile + desktop | team monitoring, first-level approval |
| Merchandiser | `budi.santoso@proqtrack.id` | Mobile | attendance, visits, rack before/after, survey |
| SPG | `nadia.permata@proqtrack.id` | Mobile | attendance, visits, sales, survey |

Migration `0011` only links these identities if the corresponding global `auth_users` account already exists and is active. Credential provisioning/rotation stays outside source control.

## Baseline master data

MKB starts with:

- 1 synthetic FMCG client;
- 1 active Sales & Merchandising project;
- 6 geofenced outlets across Jakarta/Tangerang clusters;
- 5 synthetic FMCG SKUs;
- 5 employee/persona records;
- Merchandiser/SPG assigned to Supervisor Sales;
- one active `MKB Perfect Store Audit` survey;
- cloud cutover state already set to `cloud` so browser legacy import cannot overwrite the UAT tenant.

## UAT principles

1. Field roles perform tests from mobile viewport/device.
2. Manager and Head use desktop viewport.
3. Each action uses natural field-operational behavior; do not mass-edit DB records to simulate success.
4. Evidence images must use the M4 IndexedDB → `/api/evidence` → private R2 path.
5. Tenant/project authorization must always come from the authoritative session.
6. MKB data must never appear in another tenant and another tenant's data must never appear in MKB.
7. Offline tests must be done after at least one successful authenticated cloud login on the device.
8. Any P0/P1 defect blocks go-live.

## Scenario A — Tenant and authentication isolation

### A1 Head

1. Login as Head.
2. If the account belongs to multiple organizations, explicitly select **Mitra Kreasi Bersama (MKB)**.
3. Confirm the session shows MKB and only MKB projects/data.
4. Attempt to reach another tenant using stale browser state or changed client-side organization/project values.

Expected:

- role and organization are re-resolved by the server;
- cross-tenant request is denied;
- browser claims cannot expand scope;
- logout revokes the server session.

### A2 Manager

Manager must see only `PRJ-MKB-SALES-UAT`; cannot mutate another tenant or unassigned project.

### A3 Field roles

Merchandiser/SPG must be bound to their own employee identity and authorized project. Device pairing rules remain active.

## Scenario B — Merchandiser: real mobile field day

Persona: Budi Santoso.

1. Mobile login and confirm MKB project.
2. Check in with valid GPS.
3. Open assigned outlet visit.
4. Validate geofence behavior outside and inside allowed radius.
5. Start visit.
6. Capture **Rack Before**.
7. Complete `MKB Perfect Store Audit`.
8. Record display/facing observations.
9. Capture **Rack After**.
10. Complete visit.
11. Check out.

Expected:

- attendance/visit rows are D1 authoritative;
- photos first persist locally and upload privately to R2;
- rack-before/rack-after semantics are preserved;
- GPS/evidence metadata remain linked to project, outlet, employee and visit;
- duplicate submit is rejected/idempotent.

## Scenario C — SPG: mobile sales execution

Persona: Nadia Permata.

1. Check in.
2. Start outlet visit.
3. Submit quantities for at least 3 MKB SKUs.
4. Submit sales value.
5. Complete Perfect Store survey.
6. Complete visit and check out.

Expected:

- sales are linked to MKB project/outlet/employee/product;
- sales KPI appears in server-side analytics;
- SPG cannot post sales on another project or for another employee.

## Scenario D — Offline-first recovery

Use Merchandiser or SPG after a successful cloud login.

1. Start an assigned activity while online.
2. Enable airplane/offline mode.
3. Complete one operational write and capture one photo.
4. Confirm UI shows local pending/sync state.
5. Close/reopen the app while still offline.
6. Reconnect.
7. Allow durable outbox/evidence queue to flush.
8. Refresh on the same device.
9. Login from another authorized browser/device and verify server state.

Expected:

- operational mutation survives restart in IndexedDB;
- image Blob survives restart;
- no API response is served from Service Worker cache;
- retries are idempotent;
- R2 contains one authoritative evidence object;
- revision conflict is surfaced/rebased rather than silently overwriting newer server state.

## Scenario E — Supervisor operations

Persona: Rizky Pratama.

1. Review Budi and Nadia activities only.
2. Verify unrelated employees are not exposed.
3. Create/review an attendance-correction or visit-exception workflow.
4. Approve Supervisor step where applicable.
5. Verify audit/event trail.
6. Verify notification state.

Expected:

- Supervisor scope is team/project bound;
- self-approval rules are enforced;
- event trail records actor/action/time.

## Scenario F — Manager desktop control

Persona: Manager MKB.

1. Open server-side analytics overview for MKB.
2. Validate visits, attendance, sales, surveys and top products against activities created in B/C.
3. Filter `PRJ-MKB-SALES-UAT`.
4. Browse visits using cursor pagination; ensure no duplicate rows between pages.
5. Review and approve Manager step of a staged workflow.
6. Generate Activity CSV report.
7. Generate Sales JSON report.
8. Download both through authenticated private report route.
9. Create a recurring daily report schedule, pause it, then resume it.

Expected:

- analytics is project-scoped and server-generated;
- cursor cannot grant broader scope;
- report lifecycle reaches completed or bounded retry/failure state;
- report object is private in R2;
- pause/resume keeps configured local run hour/day;
- one schedule slot creates at most one job.

## Scenario G — Head executive approval

Persona: Head MKB.

1. Review MKB aggregate analytics.
2. Generate a report with `requiresApproval=true` using a different requester where possible.
3. Confirm report enters `pending_approval`.
4. Approve publication as Head.
5. Confirm report becomes `published`.
6. Verify requester cannot approve their own approval request.
7. Review notifications and workflow events.

## Scenario H — Cross-tenant negative tests

For every role:

- change local `organizationId` manually;
- change project ID to an unauthorized value;
- replay an old token/session after role/membership change;
- call M6 endpoints without token;
- try query-string token authentication;
- try legacy `/api/state` and `/api/files`.

Expected:

- authoritative D1 membership wins;
- revoked/stale scope is rejected on the next request;
- unauthenticated protected endpoint returns 401;
- query-string token never authenticates;
- legacy state/file APIs remain locked.

## Scenario I — Reliability and failure handling

1. Create duplicate client mutation/idempotency request.
2. Re-send same evidence ID/hash.
3. Re-send same evidence ID with different content hash.
4. Reproduce report processing failure and verify retry/backoff.
5. Verify expired report lease is recovered by cron.
6. Verify M5 monitoring/telemetry continues to record M7 traffic.

Expected:

- same idempotent operation does not duplicate data;
- conflicting evidence hash returns conflict;
- report retries are bounded;
- cron resumes expired lease;
- no tenant-sensitive raw IP is persisted in distributed limiter records.

## Go-live exit criteria

### P0 — mandatory

- login/session/tenant isolation PASS for all five personas;
- D1 operational source-of-truth PASS;
- offline restart + reconnect PASS;
- evidence R2 PASS;
- role/project isolation PASS;
- workflow separation-of-duties PASS;
- report generation/download PASS;
- server analytics/cursor PASS;
- security/auth-boundary smoke PASS;
- no P0/P1 open defect.

### P1 — mandatory before broad rollout

- mobile layout usable for Merchandiser/SPG/Supervisor;
- desktop layout usable for Manager/Head;
- notification states understandable;
- sync/pending/conflict status understandable;
- scheduled report pause/resume PASS;
- recovery point exists for deployment.

### P2 — may become backlog

- copy/layout polish;
- non-blocking animation issues;
- minor report formatting improvements.

## UAT evidence record

For each scenario record:

- scenario ID;
- persona;
- device/viewport;
- timestamp;
- PASS/FAIL;
- request ID when relevant;
- screenshot/photo reference when relevant;
- D1/R2/report/workflow IDs when relevant;
- defect severity and reproduction steps.

Do not put account passwords, bearer tokens or raw secrets in UAT evidence.
