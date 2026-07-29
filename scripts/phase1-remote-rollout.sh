#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CONFIRM_REMOTE_ROLLOUT:-}" != "YES" ]]; then
  echo "BLOCKED: set CONFIRM_REMOTE_ROLLOUT=YES to authorize remote backup, migration, deploy, and smoke tests."
  exit 2
fi

PROD_URL="${PROQTRACK_PROD_URL:-https://proqtrack.arywibowo.workers.dev}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="backups/remote"
BACKUP_FILE="${BACKUP_DIR}/proqtrack-d1-${STAMP}.sql"
mkdir -p "${BACKUP_DIR}"

on_error() {
  echo
  echo "REMOTE ROLLOUT FAILED at line $1."
  echo "Production API configuration remains defined by wrangler.jsonc."
  echo "D1 backup (when completed): ${BACKUP_FILE}"
}
trap 'on_error $LINENO' ERR

echo "== Phase 1 remote rollout =="
echo "Target: ${PROD_URL}"
echo "API remains locked: MVP_DATA_API_ENABLED=false"
echo "Backend auth remains required: API_AUTH_REQUIRED=true"
echo

echo "[1/7] Local readiness gate"
npm run phase1:readiness

echo
 echo "[2/7] Export remote D1 backup"
npx wrangler d1 export DB --remote --output "${BACKUP_FILE}"
test -s "${BACKUP_FILE}"
echo "Backup saved: ${BACKUP_FILE}"

echo
 echo "[3/7] Apply pending D1 migrations remotely"
npx wrangler d1 migrations apply DB --remote

echo
 echo "[4/7] Validate remote Phase 1 schema"
npx wrangler d1 execute DB --remote --file scripts/validate-phase1.sql
npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('employees','accounts','positions','organization_units','roles','permissions','identity_audit_logs') ORDER BY name;"

echo
 echo "[5/7] Deploy Worker and static assets with API still locked"
npm run deploy

echo
 echo "[6/7] Smoke test public health"
HEALTH_BODY="$(mktemp)"
HEALTH_CODE="$(curl -sS --max-time 15 -o "${HEALTH_BODY}" -w '%{http_code}' "${PROD_URL}/api/health")"
cat "${HEALTH_BODY}"
rm -f "${HEALTH_BODY}"
if [[ "${HEALTH_CODE}" != "200" ]]; then
  echo "Health smoke test failed: HTTP ${HEALTH_CODE}"
  exit 1
fi

echo
 echo "[7/7] Confirm identity endpoint is not publicly readable"
IDENTITY_BODY="$(mktemp)"
IDENTITY_CODE="$(curl -sS --max-time 15 -o "${IDENTITY_BODY}" -w '%{http_code}' "${PROD_URL}/api/identity/employees?limit=1")"
cat "${IDENTITY_BODY}"
rm -f "${IDENTITY_BODY}"
if [[ "${IDENTITY_CODE}" != "401" && "${IDENTITY_CODE}" != "403" && "${IDENTITY_CODE}" != "503" ]]; then
  echo "Identity lock smoke test failed: expected 401/403/503, received HTTP ${IDENTITY_CODE}"
  exit 1
fi

echo
 echo "REMOTE ROLLOUT COMPLETED"
echo "Backup: ${BACKUP_FILE}"
echo "Health: HTTP ${HEALTH_CODE}"
echo "Identity endpoint remains protected: HTTP ${IDENTITY_CODE}"
echo "MVP_DATA_API_ENABLED was not changed by this script."
