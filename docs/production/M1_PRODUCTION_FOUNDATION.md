# Milestone 1 — Production Foundation

Status: implemented on `main`; production foundation remains dark/unused by application CRUD until Milestone 2/3.

## Goal

Build a server-side production foundation without changing the current ProQTrack UI or switching operational traffic away from the existing MVP/localStorage flow yet.

Milestone 1 is intentionally additive. Existing browser data, MVP Worker endpoints, and legacy D1 tables remain untouched while later milestones migrate authorization and CRUD to the new model.

## Source-of-truth target

The target architecture is:

`UI -> Worker API -> D1` for operational records and `UI -> Worker API -> R2` for evidence/files.

Browser localStorage must eventually be reduced to preferences/legacy migration input. Offline operational caching will move to IndexedDB/outbox in Milestone 4.

## Namespaced production core

Migration `0005_production_foundation.sql` introduces a dedicated `core_*` namespace. This is deliberate: the remote MVP database contains legacy/unmanaged operational table names that are not fully represented by the current migration history. Reusing generic names such as `clients`, `projects`, or `employees` can collide with those tables.

Milestone 1 therefore follows a zero-touch-legacy rule:

- no `DROP TABLE`
- no `ALTER TABLE`
- no reuse of generic legacy operational table names
- all new production indexes are also namespaced

The normalized foundation includes:

- `core_organizations`
- `core_organization_users`
- `core_clients`
- `core_projects`
- `core_project_memberships`
- `core_employees`
- `core_employee_project_assignments`
- `core_outlets`
- `core_project_outlets`
- `core_visits`
- `core_attendance`
- `core_products`
- `core_product_sales`
- `core_survey_templates`
- `core_survey_questions`
- `core_survey_responses`
- `core_field_evidence`
- `core_operational_audit_logs`
- `core_api_idempotency_keys`
- `core_legacy_import_batches`

Every tenant-owned core table carries `organization_id`. Composite foreign keys are used on tenant-owned domain relationships so a row from one organization cannot be attached to a parent row from another organization.

Core business records prefer status transitions and restrictive parent deletion. This reduces accidental tenant-wide deletion risk.

## Legacy isolation

Existing tables including `app_snapshots`, `file_metadata`, `security_audit_logs`, `report_generation_jobs`, `auth_users`, and any unmanaged legacy operational tables remain unchanged in Milestone 1.

`app_snapshots('primary')` remains legacy and must not become the production source of truth.

`auth_users` remains the current global authentication directory. `core_organization_users` supplies the future tenant membership boundary. Milestone 2 will make server-side membership and role resolution authoritative before operational CRUD is moved to the core schema.

Before legacy data is migrated, Milestone 2/3 must inventory the actual remote schema and map each legacy/localStorage collection explicitly into the appropriate `core_*` table.

## Environment isolation

`wrangler.jsonc` defines named Cloudflare environments:

| Environment | D1 target | R2 target | Data API | File API |
| --- | --- | --- | --- | --- |
| development | `proqtrack-development` | `proqtrack-development-files` | OFF | OFF |
| staging | `proqtrack-staging` | `proqtrack-staging-files` | OFF | OFF |
| production | `proqtrack-production` | `proqtrack-production-files` | OFF | OFF |

The top-level `proqtrack-mvp` configuration remains in place for backward compatibility with the current deployment workflow.

Named remote resources must exist before deploying those environments. Do not point staging or production at the MVP database/bucket as a shortcut.

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

Do not run named remote migration/deploy commands until their D1/R2 resources and `API_AUTH_SECRET` are provisioned.

## CI safety gates

CI validates:

1. all D1 migrations on a fresh local D1 database
2. production-foundation schema guards
3. existing application test suite
4. application build
5. Wrangler Worker dry-run

The foundation tests additionally reject destructive migration statements and generic operational table names in migration 0005.

## Milestone 1 exit criteria

Milestone 1 is complete when:

1. CI passes on `main`.
2. Migration 0005 applies successfully to the current remote MVP D1 without modifying legacy tables.
3. Worker deployment succeeds after migration.
4. `MVP_DATA_API_ENABLED=false` and `MVP_FILE_API_ENABLED=false` remain in effect.
5. No application traffic reads/writes the new `core_*` tables yet.

## Milestone 2 handoff

Milestone 2 must implement one authoritative server authentication and authorization path:

- resolve identity from `auth_users`
- resolve organization membership/role from `core_organization_users`
- resolve project access from `core_project_memberships`
- derive tenant scope on the server, never from browser-supplied organization/project claims alone
- add session/revocation controls
- add negative tests proving cross-organization access returns 403

Only after those gates pass should operational CRUD begin moving from localStorage to D1.
