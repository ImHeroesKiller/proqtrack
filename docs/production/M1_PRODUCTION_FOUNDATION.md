# Milestone 1 — Production Foundation

Status: implementation branch `feat/production-foundation-m1`.

## Goal

Build the server-side production foundation without changing the current ProQTrack UI or switching operational traffic away from the existing MVP/localStorage flow yet.

Milestone 1 is intentionally additive. The existing MVP Worker endpoints and browser data model remain functional while later milestones migrate authorization and CRUD to the new model.

## Source-of-truth target

The target architecture is:

`UI -> Worker API -> D1` for operational records and `UI -> Worker API -> R2` for evidence/files.

Browser localStorage must eventually be reduced to preferences/legacy migration input. Offline operational caching will move to IndexedDB/outbox in Milestone 4.

## Production D1 foundation

Migration `0005_production_foundation.sql` introduces tenant-aware normalized tables for:

- organizations and organization membership
- clients and projects
- project membership
- employees and project assignments
- outlets and project-outlet mapping
- visits and attendance
- products and product sales
- survey templates/questions/responses/answers
- field evidence metadata
- operational audit logs
- API idempotency keys
- legacy import batches

Every tenant-owned production table carries `organization_id`. Composite foreign keys are used on domain relationships so a row from one organization cannot be attached to a parent row from another organization.

The schema prefers soft status transitions and restrictive parent deletion for core business records. This avoids accidental tenant-wide data deletion.

## Legacy bridge

The existing MVP tables are not removed in this milestone.

The following existing sidecar tables receive nullable tenant fields so Milestone 2/3 can migrate them safely:

- `file_metadata.organization_id`
- `file_metadata.client_id`
- `security_audit_logs.organization_id`
- `report_generation_jobs.organization_id`

`app_snapshots` remains untouched and must be treated as legacy. Do not make `app_snapshots('primary')` the production source of truth.

`auth_users` also remains untouched in M1. Organization membership is represented by `organization_users`. Milestone 2 will make server-side membership/role resolution authoritative.

## Environment isolation

`wrangler.jsonc` now defines named Cloudflare environments:

| Environment | D1 | R2 | Data API | File API |
| --- | --- | --- | --- | --- |
| development | `proqtrack-development` | `proqtrack-development-files` | OFF | OFF |
| staging | `proqtrack-staging` | `proqtrack-staging-files` | OFF | OFF |
| production | `proqtrack-production` | `proqtrack-production-files` | OFF | OFF |

The top-level `proqtrack-mvp` configuration remains in place for backward compatibility with the current deployment workflow.

Cloudflare bindings/vars are environment-specific, so each named environment explicitly declares its D1, R2, and vars.

Remote resources must exist before deploying a named environment. Do not point staging or production at the MVP database/bucket as a shortcut.

## Secrets

`API_AUTH_SECRET` must be configured independently for every deployed environment. Local secret files use `.dev.vars.<environment>` and are ignored by git. `.dev.vars.example` contains only a placeholder.

Never commit a real Worker secret.

## Commands

```bash
npm test
npm run build
npm run check

npm run db:migrate:development
npm run db:migrate:staging
npm run db:migrate:production

npm run deploy:development
npm run deploy:staging
npm run deploy:production
```

Do not run the named remote migration/deploy commands until their D1/R2 resources and `API_AUTH_SECRET` are provisioned.

## Safety gates

Before Milestone 2 begins:

1. `npm test` must pass, including `production-foundation.test.mjs`.
2. `npm run build` must pass.
3. Wrangler dry-run must pass.
4. Migration 0005 must apply successfully to a disposable/local D1 database.
5. The application must continue to work with `MVP_DATA_API_ENABLED=false` and `MVP_FILE_API_ENABLED=false`.
6. No production traffic should use the new normalized tables yet.

## Milestone 2 handoff

Milestone 2 should implement one authoritative server authentication and authorization path:

- resolve user from `auth_users`
- resolve organization role from `organization_users`
- resolve project access from `project_memberships`
- derive tenant scope on the server, never from browser-supplied organization/project claims alone
- add session/revocation controls
- add negative tests proving cross-organization access returns 403

Only after that gate passes should operational CRUD begin moving from localStorage to D1.
