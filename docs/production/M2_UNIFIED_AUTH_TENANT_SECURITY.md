# Milestone 2 — Unified Auth & Tenant Security

Status: implemented on `feat/m2-unified-auth-tenant-security`.

## Objective

Make the Worker/D1 layer the only trusted authorization boundary for cloud APIs. Browser/localStorage role, organization, project, and client claims are not authoritative.

## Runtime flow

1. User submits email/password to `POST /api/auth/login`.
2. Password is verified against `auth_users`.
3. Organization membership is resolved from `core_organization_users`.
4. Project scope is resolved from `core_project_memberships` + `core_projects`.
5. Client scope is derived from the normalized project/client records.
6. A revocable `core_auth_sessions` row is created.
7. The signed token contains a server session id (`sid`) and resolved tenant scope.
8. Every protected API request re-checks the session and current D1 authorization before forwarding to the existing Worker routes.

## Authoritative sources

- Identity/password/status: `auth_users`
- Organization status: `core_organizations`
- Tenant role/status: `core_organization_users`
- Project access: `core_project_memberships`
- Active project/client scope: `core_projects`, `core_clients`
- Session validity/revocation: `core_auth_sessions`

The legacy `auth_users.project_ids` and `auth_users.client_ids` JSON fields are not used by the M2 authorization resolver.

## Session controls

- Default TTL: 8 hours (`API_SESSION_TTL_SECONDS=28800`)
- Hard clamp: 15 minutes minimum, 12 hours maximum
- `POST /api/auth/logout`: revoke current session
- `POST /api/auth/logout-all`: revoke all active sessions for the current user
- `POST /api/auth/switch-organization`: validate target organization, issue a new session, revoke the old session
- Tokens issued before M2 do not have a server `sid` and receive `SESSION_REAUTH_REQUIRED`

User disable/suspension, organization disable, membership disable, role changes, project membership changes, and explicit session revocation are enforced on the next request because authorization is resolved again from D1.

## Existing tenant bootstrap

The browser data model already uses `ORG-DEFAULT` as its canonical tenant. Migration `0006_unified_auth_tenant_security.sql` creates the same organization in the core D1 schema and backfills existing non-superadmin server users into `core_organization_users` using their existing server role.

This is only an authentication/tenant bootstrap. Operational project/client data is not migrated in M2. Project/client JSON claim arrays are intentionally not copied.

## Superadmin

A superadmin remains a global server role from `auth_users`. It may authenticate globally or select an active organization. When operating inside an organization, project/client scope is derived from the active normalized records for that organization.

## Deployment safety

The production workflow now runs:

1. install/test/build
2. verify `API_AUTH_SECRET`
3. apply D1 migrations
4. deploy Worker
5. perform an actual HTTP health check against `/api/health`

This prevents the M2 gateway from being deployed before `core_auth_sessions` exists.

## Current cutover status

- Unified cloud API auth: enabled after M2 deployment
- Operational source of truth: still browser/localStorage
- Cloud data API: locked
- Cloud file API: locked
- Operational CRUD migration: Milestone 3

Do not enable `MVP_DATA_API_ENABLED` or `MVP_FILE_API_ENABLED` as part of M2.

## M2 exit criteria

- D1 migration applies locally and remotely
- all unit/security tests pass
- Worker bundle dry-run passes
- cross-tenant login selection is denied
- session revocation is immediate
- user suspension is immediate
- tenant role/project changes are reflected on the next request
- legacy tokens require re-authentication
- production deploy occurs only after migrations
- live `/api/health` verification passes
