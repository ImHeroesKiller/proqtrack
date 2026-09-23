#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PROQTRACK_BASE_URL:-https://proqtrack.arywibowo.workers.dev}"
RUN_KEY="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
USER_ID="UAT-SA-SMOKE-${RUN_KEY}"
EMAIL="uat.superadmin.smoke.${RUN_KEY}@proqtrack.id"
PLAIN="$(openssl rand -hex 24)"
HASH="$(PROQTRACK_BOOTSTRAP_PASSWORD="$PLAIN" node scripts/generate-password-hash.mjs 2>/dev/null)"

d1() {
  npx wrangler d1 execute DB --remote --env="" --command "$1" >/dev/null
}

cleanup() {
  set +e
  d1 "
    DELETE FROM core_auth_sessions WHERE user_id='$USER_ID';
    DELETE FROM security_audit_logs WHERE actor_id='$USER_ID';
    DELETE FROM core_organization_users WHERE user_id='$USER_ID';
    DELETE FROM auth_users WHERE id='$USER_ID';
  " >/dev/null 2>&1 || true
}
trap cleanup EXIT

d1 "
  DELETE FROM core_auth_sessions WHERE user_id='$USER_ID';
  DELETE FROM core_organization_users WHERE user_id='$USER_ID';
  DELETE FROM auth_users WHERE id='$USER_ID';
  INSERT INTO auth_users(
    id,email,password_hash,role,status,project_ids,client_ids,created_at
  ) VALUES(
    '$USER_ID','$EMAIL','$HASH','superadmin','active','[]','[]',CURRENT_TIMESTAMP
  );
"

BODY_FILE="${RUNNER_TEMP:-/tmp}/proqtrack-superadmin-smoke.json"
STATUS="$(curl --silent --show-error --retry 3   --output "$BODY_FILE" --write-out '%{http_code}'   -X POST "$BASE_URL/api/auth/login"   -H 'content-type: application/json'   --data "$(printf '{"email":"%s","password":"%s","organizationId":"ORG-NOT-REAL"}' "$EMAIL" "$PLAIN")")"

if [ "$STATUS" != "200" ]; then
  echo "::error::Superadmin production login expected HTTP 200, got $STATUS"
  cat "$BODY_FILE"
  exit 1
fi

TOKEN="$(node - "$BODY_FILE" <<'NODE'
const fs=require('fs');
const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (!data?.token) process.exit(2);
if (data?.account?.role !== 'superadmin') process.exit(3);
if (!data?.account?.organizationId) process.exit(4);
process.stdout.write(data.token);
NODE
)"

ORG_FILE="${RUNNER_TEMP:-/tmp}/proqtrack-superadmin-orgs.json"
ORG_STATUS="$(curl --silent --show-error --retry 3   --output "$ORG_FILE" --write-out '%{http_code}'   "$BASE_URL/api/admin/organizations"   -H "authorization: Bearer $TOKEN")"

if [ "$ORG_STATUS" != "200" ]; then
  echo "::error::Superadmin organization listing expected HTTP 200, got $ORG_STATUS"
  cat "$ORG_FILE"
  exit 1
fi

node - "$ORG_FILE" <<'NODE'
const fs=require('fs');
const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (!Array.isArray(data.organizations) || !data.organizations.some(x => x?.status === 'active')) {
  throw new Error('No active organization returned to superadmin');
}
NODE

echo "Superadmin production smoke PASS: login, active workspace binding, and global organization access"
