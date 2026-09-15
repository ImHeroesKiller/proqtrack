# Milestone 6 — Reporting, Workflow Automation & Scale

## Goal

M6 moves reporting, approval workflow, notifications, and operational analytics from browser-heavy behavior into server-authoritative Cloudflare Worker + D1 + private R2 paths.

D1 remains the source of truth. R2 stores generated report objects privately. Browser code consumes authenticated APIs through `window.ProQTrackM6`.

## Reporting lifecycle

`POST /api/reports` creates a queued job in the existing `report_generation_jobs` table.

Lifecycle:

`queued → processing → completed | failed | cancelled`

The processor uses a five-minute lease. Expired processing leases are returned to the queue by the scheduled Worker. Failed generation is retried with bounded backoff until `max_attempts` is reached.

Supported report types:

- `activity`
- `attendance`
- `sales`
- `surveys`
- `operational_summary`

Supported formats:

- CSV
- JSON

Production limits:

- maximum rows: 20,000
- query batch size: 1,000
- cron queue batch: 3 jobs
- report-create rate limit: 20/minute/user

Generated files are written to:

`reports/{organizationId}/{jobId}.csv|json`

R2 objects are private. Clients download them only through authenticated `GET /api/reports/:id/download`. D1 stores content type, size, and SHA-256 checksum.

## Report publication approval

A report can be requested with `requiresApproval=true`.

After generation:

`draft → pending_approval → published`

The report engine creates a `report_publish` workflow. A Head approval publishes the report. The requester cannot approve their own workflow because separation-of-duties is enforced server-side.

## Recurring reports

Routes:

- `POST /api/report-schedules`
- `GET /api/report-schedules`
- `POST /api/report-schedules/:id/status`

Cadence:

- daily
- weekly
- monthly

Schedules store a tenant timezone and convert local requested run time to UTC before storing `next_run_at`.

The 15-minute Worker cron:

1. recovers expired report leases;
2. enqueues due schedules;
3. processes the bounded report queue;
4. runs M5 production housekeeping.

A unique `(schedule_id, available_at)` index prevents duplicate scheduled jobs for the same slot.

## Workflow automation

Routes:

- `POST /api/workflows`
- `GET /api/workflows`
- `GET /api/workflows/:id`
- `POST /api/workflows/:id/action`
- `GET /api/notifications`
- `POST /api/notifications/:id/read`

Initial workflow templates:

| Workflow | Steps |
| --- | --- |
| attendance correction | Supervisor → Manager |
| visit exception | Supervisor → Manager |
| report publish | Head |
| survey reopen | Manager |

Each workflow stores:

- request state and version;
- ordered approval steps;
- actor/action timestamps;
- immutable event trail;
- role/user notifications.

M6 automatically applies only the `report_publish` side effect. Other workflows establish the approval/audit layer for future operational mutation handlers without silently changing existing field data.

## Server-side analytics

`GET /api/analytics/overview`

Default window: 30 days. Maximum window: 366 days.

Returns scoped KPI and series for:

- active employees;
- active outlets;
- visits and completion rate;
- attendance and presence rate;
- sales transactions, quantity, value;
- survey responses;
- daily visit/sales series;
- top products.

Project scope always comes from authoritative session claims. Manager/Supervisor access is restricted to assigned projects.

## Cursor queries

Routes:

- `GET /api/query/visits`
- `GET /api/query/attendance`
- `GET /api/query/sales`
- `GET /api/query/surveys`

Pagination uses an opaque base64url keyset cursor rather than OFFSET for interactive list navigation. Maximum page size is 200.

Cursor contents are only sort position + record id; tenant/project authority is recomputed on every request and is never trusted from the cursor.

## Browser bridge

`src/lib/m6-client.js` exposes:

`window.ProQTrackM6`

Namespaces:

- `analytics`
- `reports`
- `schedules`
- `workflows`
- `notifications`

The bridge reuses the authoritative M2/M3 API bearer session. It does not mint authorization locally.

## Security boundaries

- legacy `/api/state` remains locked;
- legacy `/api/files` remains locked;
- generated reports are never public R2 objects;
- unauthenticated report/workflow/analytics APIs must return 401;
- all tenant/project scopes are resolved from current server authorization;
- report/workflow API calls have dedicated distributed D1 rate-limit scopes;
- M5 headers, telemetry, dependency audit, Time Travel recovery, and security smoke gates remain active.

## Deployment order

Production pipeline must remain:

1. `npm ci`
2. critical dependency audit
3. full test suite
4. build
5. verify auth secret
6. record D1 Time Travel recovery bookmark
7. apply D1 migration `0010`
8. deploy Worker
9. verify `/api/health` reports `milestone=M6`
10. verify `d1`, `hardeningSchema`, and `reportingSchema` are ready
11. verify unauthenticated M6 endpoints return 401

Do not deploy Worker M6 before migration `0010`.

## UAT checklist

Use a production-authorized test tenant/project.

### Reporting

1. Create activity CSV report.
2. Observe queued/processing/completed lifecycle.
3. Download report and verify data/project scope.
4. Repeat as JSON.
5. Create report with publication approval enabled.
6. Confirm requester sees pending approval.
7. Approve using a different Head account.
8. Confirm publication becomes published.
9. Force/reproduce a failed job and verify retry behavior.

### Scheduling

1. Create daily report schedule.
2. Pause it.
3. Reactivate it and verify stored local run hour/day are preserved.
4. Verify only one job is created for one scheduled slot.

### Workflow

1. Employee/Supervisor creates attendance correction request.
2. Requester attempts self-approval and is denied.
3. Supervisor approves step 1.
4. Manager approves step 2.
5. Verify event trail and requester notification.
6. Repeat with rejection.

### Scale APIs

1. Open analytics overview for all authorized projects.
2. Filter one project.
3. Verify unauthorized project is denied.
4. Fetch 50 visit rows and follow `nextCursor`.
5. Verify no duplicated row across pages.
6. Repeat for attendance, sales, surveys.

## Recovery

Before production migration, GitHub Actions stores only the Cloudflare D1 Time Travel bookmark metadata. No production SQL database dump is uploaded to the public repository.

If migration/deploy causes a severe data issue:

1. stop further writes/deploys;
2. identify the pre-deploy Time Travel bookmark from the deployment artifact;
3. inspect impact;
4. restore D1 using Cloudflare Time Travel according to the M5 recovery procedure;
5. redeploy the last known-good Worker commit if required;
6. rerun health and security smoke checks.
