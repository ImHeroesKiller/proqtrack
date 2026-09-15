# Milestone 5 — Production Hardening & Observability

## Goal

Harden the M4 production architecture without changing business workflows.

Runtime path:

`Client -> Cloudflare edge -> M5 gateway -> authoritative auth -> operational API -> D1 / R2`

M5 adds distributed abuse protection, structured telemetry, operational health, security response headers, scheduled housekeeping, dependency gates, and D1 point-in-time recovery controls.

## Distributed rate limiting

The effective public gateway no longer relies only on Worker-isolate memory counters.

D1 table `core_rate_limit_buckets` stores hashed subject buckets by minute:

- login: default 10 requests/minute/IP hash;
- general authenticated API: default 120 requests/minute/user;
- sync: default 60 requests/minute/user;
- evidence upload: default 30 requests/minute/user.

The gateway stores SHA-256 subject hashes rather than raw IP addresses. Denied requests are also written to the existing security audit log.

Legacy in-memory limiters remain only as a secondary defense inside old compatibility code. The M5 gateway is the authoritative edge limiter.

## Observability

Cloudflare invocation logs remain enabled.

M5 also emits one structured `http_request` log per Worker-handled request with:

- request ID / CF Ray;
- low-cardinality route group;
- method;
- HTTP status;
- duration;
- actor ID and organization ID when authenticated;
- Cloudflare colo/country when available.

No password, bearer token, raw IP, photo payload, or request body is logged.

Minute-level aggregates are stored in `core_observability_minute` for a default 14-day retention period.

Authorized `superadmin`, `head`, and `admin` users can query:

`GET /api/monitoring/summary`

The summary covers the last 60 minutes of request count, errors, average/max latency, session status, rate-limit denials, and recent maintenance runs.

## Health endpoint

`GET /api/health` verifies both D1 connectivity and the M5 hardening schema.

A healthy M5 response requires:

- D1 query succeeds;
- `core_rate_limit_buckets` exists;
- `core_observability_minute` exists;
- `core_maintenance_runs` exists.

Deployment fails its live check if these requirements are not met.

## Security headers

Worker API responses receive:

- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- strict referrer policy;
- restricted `Permissions-Policy`;
- COOP/CORP;
- HSTS in production/MVP;
- CSP in report-only mode during M5 rollout;
- `X-Request-Id`.

Static Worker Assets receive equivalent policy through the build output `_headers` file, so static requests do not need to be routed through the Worker merely to attach headers.

CSP remains report-only during M5 to avoid breaking existing inline UI behavior. Promotion to enforcing CSP should happen only after violations are measured and remaining inline dependencies are removed.

## Scheduled housekeeping

Wrangler cron runs every 15 minutes.

The M5 maintenance job:

1. marks expired auth sessions as `expired`;
2. removes expired rate-limit buckets;
3. removes observability minute buckets past retention;
4. cleans `core_field_evidence` reservations stuck in `uploading` for more than one hour and deletes the corresponding R2 object when present;
5. retains recent maintenance audit rows;
6. records success/failure and cleanup counts in `core_maintenance_runs`.

The existing report-job timeout maintenance still runs after M5 housekeeping.

## Dependency security gate

CI and production deployment run:

`npm audit --audit-level=critical`

Critical advisories block the release. High/moderate advisories remain visible in npm output and must be reviewed before dependency upgrades; M5 does not run a blind `npm audit fix` because automated major/transitive changes can break Wrangler/runtime compatibility.

## D1 recovery — Time Travel

Production database dumps must not be uploaded as GitHub artifacts because this repository is public and the database can contain private operational data.

M5 uses Cloudflare D1 Time Travel instead. Cloudflare maintains point-in-time history automatically for production-backend D1 databases. The deploy workflow records the current Time Travel bookmark before migrations and uploads only that non-sensitive bookmark metadata.

A daily workflow also confirms that a current Time Travel bookmark can be retrieved.

Retention is controlled by the Cloudflare plan and platform limits. Confirm the available recovery window before an incident.

### Restore procedure

1. Stop write-heavy operational activity if practical.
2. Identify the timestamp or pre-deploy bookmark that represents the desired state.
3. Inspect the restore point:

   `npx wrangler d1 time-travel info proqtrack-mvp --timestamp="<RFC3339>"`

4. Record the current bookmark before restoring so the restore can be undone.
5. Restore only with explicit incident approval:

   `npx wrangler d1 time-travel restore proqtrack-mvp --bookmark="<BOOKMARK>"`

6. Run `/api/health`.
7. Validate auth, clients/projects/employees, operational sync, and evidence metadata.
8. If the chosen point was incorrect, use the previous bookmark returned by the restore operation to undo/recover.

Time Travel restore overwrites the database in place. It is an incident action, not a normal deployment step.

## Production deployment order

The production workflow is deliberately ordered:

1. npm install;
2. critical dependency audit;
3. test;
4. build;
5. ensure auth secret;
6. capture pre-deploy D1 Time Travel bookmark;
7. apply D1 migrations;
8. record D1 ID;
9. deploy Worker/assets;
10. live M5 health check;
11. security-header/auth-boundary smoke checks.

The deployment must stop before migration/deploy if the pre-deploy recovery bookmark cannot be retrieved.

## Smoke expectations

After deployment:

- `/api/health` is HTTP 200 and reports `milestone=M5`;
- D1 and hardening schema checks are true;
- API responses expose hardening headers;
- static root exposes `_headers` security policy;
- unauthenticated `/api/evidence` returns 401;
- unauthenticated `/api/monitoring/summary` returns 401;
- legacy `MVP_DATA_API_ENABLED` and `MVP_FILE_API_ENABLED` remain false.

## M5 boundaries

M5 does not make CSP enforcing yet, does not expose evidence publicly, does not unlock legacy state/file APIs, does not put database exports into public-repository artifacts, and does not add business workflow features.
