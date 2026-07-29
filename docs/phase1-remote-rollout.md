# Phase 1.6 — Remote Rollout Readiness

Status target: **ready for review, not deployed**.

## Safety baseline

- Production remains locked with `MVP_DATA_API_ENABLED=false`.
- Backend authorization remains required with `API_AUTH_REQUIRED=true`.
- Phase 1 frontend performs GET requests only.
- Remote D1 migration and production deployment require separate explicit approval.
- The validator must never run `wrangler d1 ... --remote` or `wrangler deploy`.

## Required local gate

Run:

```bash
npm run phase1:readiness
```

This gate performs:

1. Unit and source guard tests.
2. Static build.
3. Wrangler dry-run deployment validation.
4. Phase 1 rollout configuration validation.

A successful result means the branch is technically prepared for rollout review. It does not mean remote D1 has been migrated or production has been deployed.

## Manual browser gate

Run the local Worker with the local data API enabled:

```bash
npx wrangler dev --local \
  --var MVP_DATA_API_ENABLED:true \
  --var API_AUTH_REQUIRED:false
```

Validate:

- `#/employees` loads without hanging.
- `#/users` loads without hanging.
- employee photos and fallback initials work.
- employee detail is read-only.
- edit actions remain disabled.
- navigation can be repeated without request or render loops.
- POST to an identity endpoint returns HTTP 405.

## Remote rollout sequence — requires explicit approval

Only after all local gates pass and a production backup has been confirmed:

1. Confirm the exact production D1 database and current migration state.
2. Export a remote D1 backup.
3. Apply migration `0003_identity_organization.sql` remotely.
4. Run remote read-only smoke checks with API still locked from public use.
5. Deploy the Worker with `MVP_DATA_API_ENABLED=false` and `API_AUTH_REQUIRED=true`.
6. Verify `/api/health`, static app routes, and production logs.
7. Enable identity API exposure only through a separate approved change after backend authentication has been verified.

## Rollback

- Re-deploy the last known-good Worker commit.
- Keep `MVP_DATA_API_ENABLED=false` throughout rollback.
- Restore D1 from backup only when migration rollback is required and approved.
- Do not delete Phase 1 tables as an ad-hoc rollback.
