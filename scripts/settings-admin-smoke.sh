#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PROQTRACK_BASE_URL:-https://proqtrack.arywibowo.workers.dev}"
RUN_KEY="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
ORG="ORG-UAT-SETTINGS-ADMIN-${RUN_KEY}"
HEAD_ID="USR-UAT-SETTINGS-HEAD-${RUN_KEY}"
ADMIN_ID="USR-UAT-SETTINGS-ADMIN-${RUN_KEY}"
MANAGER_ID="USR-UAT-SETTINGS-MANAGER-${RUN_KEY}"
HEAD_EMAIL="uat.settings.head.${RUN_KEY}@proqtrack.id"
ADMIN_EMAIL="uat.settings.admin.${RUN_KEY}@proqtrack.id"
MANAGER_EMAIL="uat.settings.manager.${RUN_KEY}@proqtrack.id"
HEAD_PASS="$(openssl rand -hex 24)"
ADMIN_PASS="$(openssl rand -hex 24)"
MANAGER_PASS="$(openssl rand -hex 24)"
HEAD_HASH="$(PROQTRACK_BOOTSTRAP_PASSWORD="$HEAD_PASS" node scripts/generate-password-hash.mjs 2>/dev/null)"
ADMIN_HASH="$(PROQTRACK_BOOTSTRAP_PASSWORD="$ADMIN_PASS" node scripts/generate-password-hash.mjs 2>/dev/null)"
MANAGER_HASH="$(PROQTRACK_BOOTSTRAP_PASSWORD="$MANAGER_PASS" node scripts/generate-password-hash.mjs 2>/dev/null)"
TMP_DIR="${RUNNER_TEMP:-/tmp}/proqtrack-settings-admin-${RUN_KEY}"
mkdir -p "$TMP_DIR"

d1() {
  npx wrangler d1 execute DB --remote --env="" --command "$1" >/dev/null
}

cleanup() {
  set +e
  d1 "
    DELETE FROM core_auth_sessions WHERE user_id IN ('$HEAD_ID','$ADMIN_ID','$MANAGER_ID');
    DELETE FROM security_audit_logs WHERE actor_id IN ('$HEAD_ID','$ADMIN_ID','$MANAGER_ID');
    DELETE FROM core_organization_users WHERE organization_id='$ORG';
    DELETE FROM core_sync_state WHERE organization_id='$ORG';
    DELETE FROM core_organizations WHERE id='$ORG';
    DELETE FROM auth_users WHERE id IN ('$HEAD_ID','$ADMIN_ID','$MANAGER_ID');
  " >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
d1 "
  INSERT INTO core_organizations(id,code,name,status,timezone,metadata_json,created_at,updated_at)
  VALUES('$ORG','UATSETADM-$RUN_KEY','Settings Admin UAT','active','Asia/Jakarta','{"synthetic":true,"settingsAdminUat":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  INSERT INTO core_sync_state(organization_id,revision,cutover_mode,updated_at)
  VALUES('$ORG',0,'cloud',CURRENT_TIMESTAMP);
  INSERT INTO auth_users(id,email,display_name,password_hash,role,status,project_ids,client_ids,created_at) VALUES
    ('$HEAD_ID','$HEAD_EMAIL','Settings UAT Head','$HEAD_HASH','head','active','[]','[]',CURRENT_TIMESTAMP),
    ('$ADMIN_ID','$ADMIN_EMAIL','Settings UAT Admin','$ADMIN_HASH','admin','active','[]','[]',CURRENT_TIMESTAMP),
    ('$MANAGER_ID','$MANAGER_EMAIL','Settings UAT Manager','$MANAGER_HASH','manager','active','[]','[]',CURRENT_TIMESTAMP);
  INSERT INTO core_organization_users(organization_id,user_id,role,status,created_at,updated_at) VALUES
    ('$ORG','$HEAD_ID','head','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('$ORG','$ADMIN_ID','admin','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('$ORG','$MANAGER_ID','manager','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
"

LOGIN_FILE="$TMP_DIR/login.json"
LOGIN_STATUS="$(curl --silent --show-error --retry 3 --output "$LOGIN_FILE" --write-out '%{http_code}'   -X POST "$BASE_URL/api/auth/login"   -H 'content-type: application/json'   --data "$(printf '{"email":"%s","password":"%s","organizationId":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASS" "$ORG")")"
test "$LOGIN_STATUS" = "200" || { echo "::error::Settings Admin login HTTP $LOGIN_STATUS"; cat "$LOGIN_FILE"; exit 1; }

TOKEN="$(node - "$LOGIN_FILE" "$ORG" <<'NODE'
const fs=require('fs');
const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (!data.token) throw new Error('admin token missing');
if (data.account?.role !== 'admin') throw new Error('admin role mismatch');
if (data.account?.organizationId !== process.argv[3]) throw new Error('admin organization mismatch');
process.stdout.write(data.token);
NODE
)"

SESSION_FILE="$TMP_DIR/session.json"
SESSION_STATUS="$(curl --silent --show-error --output "$SESSION_FILE" --write-out '%{http_code}'   "$BASE_URL/api/auth/session" -H "authorization: Bearer $TOKEN")"
test "$SESSION_STATUS" = "200" || { echo "::error::Settings Admin session HTTP $SESSION_STATUS"; cat "$SESSION_FILE"; exit 1; }

ORG_FILE="$TMP_DIR/org.json"
ORG_STATUS="$(curl --silent --show-error --output "$ORG_FILE" --write-out '%{http_code}'   -X PATCH "$BASE_URL/api/organization/profile"   -H "authorization: Bearer $TOKEN" -H 'content-type: application/json'   --data '{"name":"Settings Admin UAT","timezone":"Asia/Jakarta","themeColor":"#ef5000","notes":"Admin Settings smoke"}')"
test "$ORG_STATUS" = "200" || { echo "::error::Settings Admin organization profile HTTP $ORG_STATUS"; cat "$ORG_FILE"; exit 1; }

ACCOUNTS_FILE="$TMP_DIR/accounts.json"
ACCOUNTS_STATUS="$(curl --silent --show-error --output "$ACCOUNTS_FILE" --write-out '%{http_code}'   "$BASE_URL/api/admin/accounts" -H "authorization: Bearer $TOKEN")"
test "$ACCOUNTS_STATUS" = "200" || { echo "::error::Settings Admin account list HTTP $ACCOUNTS_STATUS"; cat "$ACCOUNTS_FILE"; exit 1; }

node - "$ACCOUNTS_FILE" "$ADMIN_ID" "$MANAGER_ID" <<'NODE'
const fs=require('fs');
const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const ids=new Set((data.accounts||[]).map(x=>x.id));
if (!ids.has(process.argv[3]) || !ids.has(process.argv[4])) throw new Error('admin account scope incomplete');
NODE

ROLE_FILE="$TMP_DIR/role-boundary.json"
ROLE_STATUS="$(curl --silent --show-error --output "$ROLE_FILE" --write-out '%{http_code}'   -X PATCH "$BASE_URL/api/admin/accounts/$MANAGER_ID"   -H "authorization: Bearer $TOKEN" -H 'content-type: application/json'   --data '{"role":"head"}')"
test "$ROLE_STATUS" = "403" || { echo "::error::Admin role escalation expected 403 got $ROLE_STATUS"; cat "$ROLE_FILE"; exit 1; }
node - "$ROLE_FILE" <<'NODE'
const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (d.error !== 'ACCOUNT_ROLE_FORBIDDEN') throw new Error('expected ACCOUNT_ROLE_FORBIDDEN');
NODE

EMAIL_FILE="$TMP_DIR/email-boundary.json"
EMAIL_STATUS="$(curl --silent --show-error --output "$EMAIL_FILE" --write-out '%{http_code}'   -X PATCH "$BASE_URL/api/admin/accounts/$MANAGER_ID"   -H "authorization: Bearer $TOKEN" -H 'content-type: application/json'   --data '{"email":"changed.settings.uat@proqtrack.id"}')"
test "$EMAIL_STATUS" = "403" || { echo "::error::Admin global email boundary expected 403 got $EMAIL_STATUS"; cat "$EMAIL_FILE"; exit 1; }
node - "$EMAIL_FILE" <<'NODE'
const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (d.error !== 'ACCOUNT_GLOBAL_EMAIL_EDIT_FORBIDDEN') throw new Error('expected ACCOUNT_GLOBAL_EMAIL_EDIT_FORBIDDEN');
NODE

echo "Settings Admin production smoke PASS: login/session, organization profile, account scope, role escalation denial, global identity boundary"
