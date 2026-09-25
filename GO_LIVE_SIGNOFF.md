# ProQTrack Final Go-Live Sign-off

Production user-facing domain: `https://proqtrack.msg-os.com`  
Canonical Worker origin: `https://proqtrack.arywibowo.workers.dev`

## Automated release gates

Every production release must pass both the canonical Worker origin and the custom domain.

- [ ] CI: tests, build, performance budget, Worker validation
- [ ] D1 migration and pre-deploy Time Travel recovery bookmark
- [ ] Canonical Worker `/api/health`
- [ ] Custom domain pre-deploy root + `/api/health`
- [ ] Custom domain post-deploy M7 dependency health
- [ ] Security headers on canonical Worker and custom domain
- [ ] Unauthenticated protected APIs return 401 on both origins
- [ ] Superadmin login smoke through canonical Worker
- [ ] Superadmin login smoke through custom domain
- [ ] Attendance + Leave final production UAT
- [ ] Full module-role production UAT
- [ ] MKB real-tenant isolation and synthetic-UAT cleanup

## Manual final sign-off

Perform after the automated pipeline is green.

### Desktop — Manager / Head
- [ ] Login through `proqtrack.msg-os.com`
- [ ] Home renders without blocking loader/retry loop
- [ ] Clients / Projects / Employees / Outlets / Products load correctly
- [ ] Stock & Sales tables, filters and details work
- [ ] Reports load, generate and download
- [ ] No user-visible D1/R2/Worker/GitHub/schema messages
- [ ] No unexpected 4xx/5xx or CSP errors in browser console/network

### Mobile — Employee / Supervisor
- [ ] Login through `proqtrack.msg-os.com`
- [ ] Home and navigation scroll correctly
- [ ] GPS permission and Visit check-in work
- [ ] Geofence behavior is correct
- [ ] Rack Before / Rack After evidence capture works
- [ ] Attendance Manual vs Visit follows project policy
- [ ] Leave submit / review lifecycle is correct
- [ ] Offline write + photo survives app close/reopen
- [ ] Reconnect flushes once without duplicate records
- [ ] Second authorized device sees authoritative server state

### Performance evidence
- [ ] Cold-load LCP captured
- [ ] Warm-load LCP captured
- [ ] Soft navigation to `/#/` captured
- [ ] INP captured
- [ ] CLS captured
- [ ] No application long task >100 ms in clean-browser scenario
- [ ] No navigation/layout glitch during 15–30 minute operational session

## Exit criteria

**FULL GO** requires:
1. production deployment green on the exact release SHA;
2. custom-domain health/security/login gates green;
3. no open P0/P1 defect;
4. desktop + mobile manual smoke complete;
5. offline/reconnect real-device scenario complete;
6. browser performance evidence recorded.

P2/P3 cosmetic backlog may remain if it does not affect authority, data integrity, security, reliability, or core usability.

## Rollback

If a P0/P1 issue appears after release:
1. stop further rollout;
2. identify the last known-good release SHA;
3. use the recorded D1 Time Travel bookmark if data recovery is required;
4. rollback/redeploy through the production pipeline, not by manual production edits;
5. rerun health, auth, tenant isolation, and the scenario that caused the incident.
