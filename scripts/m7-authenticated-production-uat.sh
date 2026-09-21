#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PROQTRACK_BASE_URL:-https://proqtrack.arywibowo.workers.dev}"
ORG="ORG-MKB"
PROJECT="PRJ-MKB-SALES-UAT"
RUN_KEY="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"

BUDI_ID="UAT-M7-BUDI-${RUN_KEY}"
NADIA_ID="UAT-M7-NADIA-${RUN_KEY}"
RIZKY_ID="UAT-M7-RIZKY-${RUN_KEY}"
MANAGER_ID="UAT-M7-MANAGER-${RUN_KEY}"
HEAD_ID="UAT-M7-HEAD-${RUN_KEY}"

BUDI_EMP="EMP-UAT-M7-BUDI-${RUN_KEY}"
NADIA_EMP="EMP-UAT-M7-NADIA-${RUN_KEY}"
RIZKY_EMP="EMP-UAT-M7-RIZKY-${RUN_KEY}"

BUDI_EMAIL="uat.m7.budi.${RUN_KEY}@proqtrack.id"
NADIA_EMAIL="uat.m7.nadia.${RUN_KEY}@proqtrack.id"
RIZKY_EMAIL="uat.m7.rizky.${RUN_KEY}@proqtrack.id"
MANAGER_EMAIL="uat.m7.manager.${RUN_KEY}@proqtrack.id"
HEAD_EMAIL="uat.m7.head.${RUN_KEY}@proqtrack.id"

BUDI_PASS="$(openssl rand -hex 24)"
NADIA_PASS="$(openssl rand -hex 24)"
RIZKY_PASS="$(openssl rand -hex 24)"
MANAGER_PASS="$(openssl rand -hex 24)"
HEAD_PASS="$(openssl rand -hex 24)"

hash_password() {
  node - "$1" <<'NODE'
const crypto = require('crypto');
const plain = process.argv[2];
const salt = crypto.randomBytes(16);
const derived = crypto.pbkdf2Sync(Buffer.from(plain), salt, 100000, 32, 'sha256');
const b64u = value => Buffer.from(value).toString('base64url');
process.stdout.write(`pbkdf2$sha256$100000$${b64u(salt)}$${b64u(derived)}`);
NODE
}

BUDI_HASH="$(hash_password "$BUDI_PASS")"
NADIA_HASH="$(hash_password "$NADIA_PASS")"
RIZKY_HASH="$(hash_password "$RIZKY_PASS")"
MANAGER_HASH="$(hash_password "$MANAGER_PASS")"
HEAD_HASH="$(hash_password "$HEAD_PASS")"

TMP_DIR="${RUNNER_TEMP:-/tmp}/proqtrack-m7-uat-${RUN_KEY}"
mkdir -p "$TMP_DIR"
chmod 700 "$TMP_DIR"

d1_exec() {
  npx wrangler d1 execute DB --remote --env="" --command "$1" >/dev/null
}

cleanup() {
  set +e
  d1_exec "
    DELETE FROM core_sync_conflicts
      WHERE organization_id='$ORG' AND actor_user_id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');
    DELETE FROM core_sync_mutations
      WHERE organization_id='$ORG' AND actor_user_id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');
    DELETE FROM core_survey_responses
      WHERE organization_id='$ORG' AND id LIKE 'UAT-M7-%-${RUN_KEY}';
    DELETE FROM core_product_sales
      WHERE organization_id='$ORG' AND id LIKE 'UAT-M7-%-${RUN_KEY}';
    DELETE FROM core_visits
      WHERE organization_id='$ORG' AND id LIKE 'UAT-M7-%-${RUN_KEY}';
    DELETE FROM core_attendance
      WHERE organization_id='$ORG' AND id LIKE 'UAT-M7-%-${RUN_KEY}';
    DELETE FROM core_auth_sessions
      WHERE user_id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');
    DELETE FROM core_auth_devices
      WHERE organization_id='$ORG' AND user_id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');
    DELETE FROM core_employee_project_assignments
      WHERE organization_id='$ORG' AND employee_id IN ('$BUDI_EMP','$NADIA_EMP','$RIZKY_EMP');
    DELETE FROM core_project_memberships
      WHERE organization_id='$ORG' AND user_id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');
    DELETE FROM core_employees
      WHERE organization_id='$ORG' AND id IN ('$BUDI_EMP','$NADIA_EMP','$RIZKY_EMP');
    DELETE FROM core_organization_users
      WHERE organization_id='$ORG' AND user_id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');
    DELETE FROM auth_users
      WHERE id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');
    UPDATE core_sync_state
      SET last_mutation_id=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE organization_id='$ORG'
        AND last_mutation_id LIKE 'UAT-M7-%-${RUN_KEY}%';
  " >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

d1_exec "
  DELETE FROM core_auth_sessions
    WHERE user_id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');
  DELETE FROM core_auth_devices
    WHERE organization_id='$ORG' AND user_id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');
  DELETE FROM core_employee_project_assignments
    WHERE organization_id='$ORG' AND employee_id IN ('$BUDI_EMP','$NADIA_EMP','$RIZKY_EMP');
  DELETE FROM core_project_memberships
    WHERE organization_id='$ORG' AND user_id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');
  DELETE FROM core_employees
    WHERE organization_id='$ORG' AND id IN ('$BUDI_EMP','$NADIA_EMP','$RIZKY_EMP');
  DELETE FROM core_organization_users
    WHERE organization_id='$ORG' AND user_id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');
  DELETE FROM auth_users
    WHERE id IN ('$BUDI_ID','$NADIA_ID','$RIZKY_ID','$MANAGER_ID','$HEAD_ID');

  INSERT INTO auth_users(id,email,password_hash,role,status,project_ids,client_ids,created_at) VALUES
    ('$BUDI_ID','$BUDI_EMAIL','$BUDI_HASH','employee','active','[]','[]',CURRENT_TIMESTAMP),
    ('$NADIA_ID','$NADIA_EMAIL','$NADIA_HASH','employee','active','[]','[]',CURRENT_TIMESTAMP),
    ('$RIZKY_ID','$RIZKY_EMAIL','$RIZKY_HASH','supervisor','active','[]','[]',CURRENT_TIMESTAMP),
    ('$MANAGER_ID','$MANAGER_EMAIL','$MANAGER_HASH','manager','active','[]','[]',CURRENT_TIMESTAMP),
    ('$HEAD_ID','$HEAD_EMAIL','$HEAD_HASH','head','active','[]','[]',CURRENT_TIMESTAMP);

  INSERT INTO core_organization_users(organization_id,user_id,role,status,created_at,updated_at) VALUES
    ('$ORG','$BUDI_ID','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('$ORG','$NADIA_ID','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('$ORG','$RIZKY_ID','supervisor','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('$ORG','$MANAGER_ID','manager','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('$ORG','$HEAD_ID','head','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

  INSERT INTO core_project_memberships(organization_id,project_id,user_id,role,status,created_at,updated_at) VALUES
    ('$ORG','$PROJECT','$BUDI_ID','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('$ORG','$PROJECT','$NADIA_ID','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('$ORG','$PROJECT','$RIZKY_ID','supervisor','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('$ORG','$PROJECT','$MANAGER_ID','manager','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

  INSERT INTO core_employees(
    id,organization_id,auth_user_id,employee_code,full_name,email,employment_status,metadata_json,created_at,updated_at
  ) VALUES
    ('$BUDI_EMP','$ORG','$BUDI_ID','UAT-MERCH-${RUN_KEY}','UAT Merchandiser','$BUDI_EMAIL','active','{"synthetic":true,"m7AuthenticatedUat":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('$NADIA_EMP','$ORG','$NADIA_ID','UAT-SPG-${RUN_KEY}','UAT SPG','$NADIA_EMAIL','active','{"synthetic":true,"m7AuthenticatedUat":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('$RIZKY_EMP','$ORG','$RIZKY_ID','UAT-SPV-${RUN_KEY}','UAT Supervisor','$RIZKY_EMAIL','active','{"synthetic":true,"m7AuthenticatedUat":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

  INSERT INTO core_employee_project_assignments(
    id,organization_id,project_id,employee_id,supervisor_user_id,position_name,status,starts_on,metadata_json,created_at,updated_at
  ) VALUES
    ('ASN-UAT-M7-BUDI-${RUN_KEY}','$ORG','$PROJECT','$BUDI_EMP','$RIZKY_ID','Merchandiser','active','2026-09-01','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('ASN-UAT-M7-NADIA-${RUN_KEY}','$ORG','$PROJECT','$NADIA_EMP','$RIZKY_ID','SPG','active','2026-09-01','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('ASN-UAT-M7-RIZKY-${RUN_KEY}','$ORG','$PROJECT','$RIZKY_EMP',NULL,'Supervisor Sales','active','2026-09-01','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
"

http_status() {
  local method="$1"; shift
  local url="$1"; shift
  local output="$1"; shift
  curl --silent --show-error --retry 3 --request "$method" --output "$output" --write-out '%{http_code}' "$@" "$url"
}

expect_status() {
  local expected="$1"; local actual="$2"; local file="$3"; local label="$4"
  if [ "$actual" != "$expected" ]; then
    echo "::error::$label expected HTTP $expected got $actual"
    cat "$file"
    exit 1
  fi
}

json_value() {
  local file="$1"; local expr="$2"
  node - "$file" "$expr" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const expr = process.argv[3];
const data = JSON.parse(fs.readFileSync(file,'utf8'));
const value = expr.split('.').filter(Boolean).reduce((v,k)=>v?.[k],data);
if (value == null) process.exit(2);
process.stdout.write(typeof value === 'object' ? JSON.stringify(value) : String(value));
NODE
}

login() {
  local label="$1"; local email="$2"; local password="$3"; local device_id="${4:-}"; local device_proof="${5:-}"
  local file="$TMP_DIR/login-${label}.json"
  local body
  if [ -n "$device_id" ]; then
    body="$(printf '{"email":"%s","password":"%s","organizationId":"%s","deviceId":"%s","deviceProof":"%s","deviceLabel":"M7 GitHub UAT"}' "$email" "$password" "$ORG" "$device_id" "$device_proof")"
  else
    body="$(printf '{"email":"%s","password":"%s","organizationId":"%s"}' "$email" "$password" "$ORG")"
  fi
  local status
  status="$(http_status POST "$BASE_URL/api/auth/login" "$file" -H 'content-type: application/json' --data "$body")"
  expect_status 200 "$status" "$file" "login $label"
  json_value "$file" token
}

assert_session() {
  local label="$1"; local token="$2"; local role="$3"
  local file="$TMP_DIR/session-${label}.json"
  local status
  status="$(http_status GET "$BASE_URL/api/auth/session" "$file" -H "authorization: Bearer $token")"
  expect_status 200 "$status" "$file" "session $label"
  node - "$file" "$role" "$ORG" "$PROJECT" <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const role = process.argv[3], org = process.argv[4], project = process.argv[5];
if (data.role !== role) throw new Error(`role mismatch ${data.role} != ${role}`);
if (data.organizationId !== org) throw new Error(`org mismatch ${data.organizationId} != ${org}`);
if (!['head','admin','superadmin'].includes(role) && !data.projectIds?.includes(project)) {
  throw new Error('project scope missing');
}
NODE
}

BUDI_TOKEN="$(login budi "$BUDI_EMAIL" "$BUDI_PASS" "DEVICE-UAT-BUDI-A-${RUN_KEY}" "PROOF-UAT-BUDI-A-${RUN_KEY}")"
NADIA_TOKEN="$(login nadia "$NADIA_EMAIL" "$NADIA_PASS" "DEVICE-UAT-NADIA-A-${RUN_KEY}" "PROOF-UAT-NADIA-A-${RUN_KEY}")"
RIZKY_TOKEN="$(login rizky "$RIZKY_EMAIL" "$RIZKY_PASS")"
MANAGER_TOKEN="$(login manager "$MANAGER_EMAIL" "$MANAGER_PASS")"
HEAD_TOKEN="$(login head "$HEAD_EMAIL" "$HEAD_PASS")"

assert_session budi "$BUDI_TOKEN" employee
assert_session nadia "$NADIA_TOKEN" employee
assert_session rizky "$RIZKY_TOKEN" supervisor
assert_session manager "$MANAGER_TOKEN" manager
assert_session head "$HEAD_TOKEN" head

cross_file="$TMP_DIR/cross-org.json"
cross_body="$(printf '{"email":"%s","password":"%s","organizationId":"ORG-DEFAULT","deviceId":"%s","deviceProof":"%s"}' "$BUDI_EMAIL" "$BUDI_PASS" "DEVICE-UAT-BUDI-A-${RUN_KEY}" "PROOF-UAT-BUDI-A-${RUN_KEY}")"
cross_status="$(http_status POST "$BASE_URL/api/auth/login" "$cross_file" -H 'content-type: application/json' --data "$cross_body")"
expect_status 403 "$cross_status" "$cross_file" "cross-tenant login"

second_file="$TMP_DIR/device-denied.json"
second_body="$(printf '{"email":"%s","password":"%s","organizationId":"%s","deviceId":"%s","deviceProof":"%s"}' "$BUDI_EMAIL" "$BUDI_PASS" "$ORG" "DEVICE-UAT-BUDI-B-${RUN_KEY}" "PROOF-UAT-BUDI-B-${RUN_KEY}")"
second_status="$(http_status POST "$BASE_URL/api/auth/login" "$second_file" -H 'content-type: application/json' --data "$second_body")"
expect_status 403 "$second_status" "$second_file" "second device before reset"

bootstrap_budi="$TMP_DIR/bootstrap-budi.json"
bootstrap_status="$(http_status GET "$BASE_URL/api/core/bootstrap" "$bootstrap_budi" -H "authorization: Bearer $BUDI_TOKEN")"
expect_status 200 "$bootstrap_status" "$bootstrap_budi" "Budi bootstrap"
node - "$bootstrap_budi" "$BUDI_EMP" "$ORG" "$PROJECT" <<'NODE'
const fs=require('fs');
const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const emp=process.argv[3], org=process.argv[4], project=process.argv[5];
if (!data.ok || data.cutoverMode !== 'cloud') throw new Error('bootstrap not cloud');
if (!data.data.projects?.some(x=>x.id===project)) throw new Error('project missing');
if (!data.data.employees?.some(x=>x.id===emp)) throw new Error('own employee missing');
if ((data.data.outlets||[]).length < 6) throw new Error('outlets missing');
if ((data.data.products||[]).length < 5) throw new Error('products missing');
if (!data.data.surveyTemplates?.some(x=>x.id==='SURV-MKB-PERFECT-STORE')) throw new Error('survey missing');
for (const rows of Object.values(data.data)) {
  if (!Array.isArray(rows)) continue;
  for (const row of rows) if (row.organizationId && row.organizationId !== org) throw new Error('cross-tenant row leaked');
}
NODE

REV_BUDI="$(json_value "$bootstrap_budi" revision)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TODAY="$(date -u +%Y-%m-%d)"
SYNC_BUDI_ID="UAT-M7-BUDI-${RUN_KEY}-1"
sync_budi="$TMP_DIR/sync-budi.json"
sync_budi_body="$(cat <<JSON
{"mutationId":"$SYNC_BUDI_ID","baseRevision":$REV_BUDI,"changes":[
  {"entity":"attendance","op":"upsert","row":{"id":"UAT-M7-ATT-BUDI-${RUN_KEY}","projectId":"$PROJECT","employeeId":"$BUDI_EMP","workDate":"$TODAY","status":"present","checkInAt":"$NOW","checkInLatitude":-6.214620,"checkInLongitude":106.822900,"idempotencyKey":"UAT-M7-ATT-BUDI-${RUN_KEY}"}},
  {"entity":"visits","op":"upsert","row":{"id":"UAT-M7-VISIT-BUDI-${RUN_KEY}","projectId":"$PROJECT","outletId":"OUT-MKB-001","employeeId":"$BUDI_EMP","status":"completed","startedAt":"$NOW","completedAt":"$NOW","startLatitude":-6.214620,"startLongitude":106.822900,"endLatitude":-6.214620,"endLongitude":106.822900,"idempotencyKey":"UAT-M7-VISIT-BUDI-${RUN_KEY}"}}
]}
JSON
)"
sync_budi_status="$(http_status POST "$BASE_URL/api/core/sync" "$sync_budi" -H "authorization: Bearer $BUDI_TOKEN" -H 'content-type: application/json' --data "$sync_budi_body")"
expect_status 200 "$sync_budi_status" "$sync_budi" "Budi field sync"

replay_file="$TMP_DIR/replay-budi.json"
replay_status="$(http_status POST "$BASE_URL/api/core/sync" "$replay_file" -H "authorization: Bearer $BUDI_TOKEN" -H 'content-type: application/json' --data "$sync_budi_body")"
expect_status 200 "$replay_status" "$replay_file" "Budi idempotent replay"
node - "$replay_file" <<'NODE'
const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (d.idempotent !== true) throw new Error('sync replay was not idempotent');
NODE

bootstrap_nadia="$TMP_DIR/bootstrap-nadia.json"
bootstrap_nadia_status="$(http_status GET "$BASE_URL/api/core/bootstrap" "$bootstrap_nadia" -H "authorization: Bearer $NADIA_TOKEN")"
expect_status 200 "$bootstrap_nadia_status" "$bootstrap_nadia" "Nadia bootstrap"
REV_NADIA="$(json_value "$bootstrap_nadia" revision)"
SYNC_NADIA_ID="UAT-M7-NADIA-${RUN_KEY}-1"
sync_nadia="$TMP_DIR/sync-nadia.json"
sync_nadia_body="$(cat <<JSON
{"mutationId":"$SYNC_NADIA_ID","baseRevision":$REV_NADIA,"changes":[
  {"entity":"productSales","op":"upsert","row":{"id":"UAT-M7-SALE-1-${RUN_KEY}","projectId":"$PROJECT","outletId":"OUT-MKB-002","employeeId":"$NADIA_EMP","productId":"PROD-MKB-001","quantity":2,"unitPrice":10000,"totalAmount":20000,"soldAt":"$NOW","idempotencyKey":"UAT-M7-SALE-1-${RUN_KEY}"}},
  {"entity":"productSales","op":"upsert","row":{"id":"UAT-M7-SALE-2-${RUN_KEY}","projectId":"$PROJECT","outletId":"OUT-MKB-002","employeeId":"$NADIA_EMP","productId":"PROD-MKB-002","quantity":1,"unitPrice":15000,"totalAmount":15000,"soldAt":"$NOW","idempotencyKey":"UAT-M7-SALE-2-${RUN_KEY}"}},
  {"entity":"productSales","op":"upsert","row":{"id":"UAT-M7-SALE-3-${RUN_KEY}","projectId":"$PROJECT","outletId":"OUT-MKB-002","employeeId":"$NADIA_EMP","productId":"PROD-MKB-003","quantity":3,"unitPrice":8000,"totalAmount":24000,"soldAt":"$NOW","idempotencyKey":"UAT-M7-SALE-3-${RUN_KEY}"}},
  {"entity":"surveyResponses","op":"upsert","row":{"id":"UAT-M7-SURVEY-NADIA-${RUN_KEY}","templateId":"SURV-MKB-PERFECT-STORE","projectId":"$PROJECT","outletId":"OUT-MKB-002","employeeId":"$NADIA_EMP","status":"submitted","answers":{"Q-MKB-PS-01":true,"Q-MKB-PS-02":4,"Q-MKB-PS-03":"Baik","Q-MKB-PS-04":"M7 automated UAT"},"submittedAt":"$NOW","idempotencyKey":"UAT-M7-SURVEY-NADIA-${RUN_KEY}"}}
]}
JSON
)"
sync_nadia_status="$(http_status POST "$BASE_URL/api/core/sync" "$sync_nadia" -H "authorization: Bearer $NADIA_TOKEN" -H 'content-type: application/json' --data "$sync_nadia_body")"
expect_status 200 "$sync_nadia_status" "$sync_nadia" "Nadia sales and survey sync"

employee_analytics="$TMP_DIR/employee-analytics.json"
employee_analytics_status="$(http_status GET "$BASE_URL/api/analytics/overview?projectId=$PROJECT" "$employee_analytics" -H "authorization: Bearer $BUDI_TOKEN")"
expect_status 403 "$employee_analytics_status" "$employee_analytics" "employee analytics denial"

for entry in "rizky:$RIZKY_TOKEN" "manager:$MANAGER_TOKEN" "head:$HEAD_TOKEN"; do
  label="${entry%%:*}"
  token="${entry#*:}"
  file="$TMP_DIR/analytics-${label}.json"
  status="$(http_status GET "$BASE_URL/api/analytics/overview?projectId=$PROJECT" "$file" -H "authorization: Bearer $token")"
  expect_status 200 "$status" "$file" "analytics $label"
  node - "$file" <<'NODE'
const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (!d.ok) throw new Error('analytics not ok');
if (Number(d.kpis?.visits?.total||0) < 1) throw new Error('visit not visible');
if (Number(d.kpis?.sales?.transactions||0) < 3) throw new Error('sales not visible');
if (Number(d.kpis?.surveys?.responses||0) < 1) throw new Error('survey not visible');
NODE
done

for entry in "budi:$BUDI_TOKEN" "rizky:$RIZKY_TOKEN" "manager:$MANAGER_TOKEN"; do
  label="${entry%%:*}"
  token="${entry#*:}"
  file="$TMP_DIR/admin-denied-${label}.json"
  status="$(http_status GET "$BASE_URL/api/admin/accounts" "$file" -H "authorization: Bearer $token")"
  expect_status 403 "$status" "$file" "admin account denial $label"
done

head_accounts="$TMP_DIR/head-accounts.json"
head_accounts_status="$(http_status GET "$BASE_URL/api/admin/accounts" "$head_accounts" -H "authorization: Bearer $HEAD_TOKEN")"
expect_status 200 "$head_accounts_status" "$head_accounts" "Head account list"

manager_reports="$TMP_DIR/manager-reports.json"
manager_reports_status="$(http_status GET "$BASE_URL/api/reports?limit=5" "$manager_reports" -H "authorization: Bearer $MANAGER_TOKEN")"
expect_status 200 "$manager_reports_status" "$manager_reports" "Manager reports list"

head_reports="$TMP_DIR/head-reports.json"
head_reports_status="$(http_status GET "$BASE_URL/api/reports?limit=5" "$head_reports" -H "authorization: Bearer $HEAD_TOKEN")"
expect_status 200 "$head_reports_status" "$head_reports" "Head reports list"

reset_file="$TMP_DIR/reset-device.json"
reset_status="$(http_status POST "$BASE_URL/api/admin/accounts/$BUDI_ID/reset-device" "$reset_file" -H "authorization: Bearer $HEAD_TOKEN" -H 'content-type: application/json' --data '{}')"
expect_status 200 "$reset_status" "$reset_file" "Head reset employee device"

BUDI_TOKEN_2="$(login budi-after-reset "$BUDI_EMAIL" "$BUDI_PASS" "DEVICE-UAT-BUDI-B-${RUN_KEY}" "PROOF-UAT-BUDI-B-${RUN_KEY}")"
assert_session budi-after-reset "$BUDI_TOKEN_2" employee

conflict_file="$TMP_DIR/conflict.json"
conflict_body="$(cat <<JSON
{"mutationId":"UAT-M7-CONFLICT-${RUN_KEY}","baseRevision":$REV_BUDI,"changes":[
  {"entity":"attendance","op":"upsert","row":{"id":"UAT-M7-ATT-CONFLICT-${RUN_KEY}","projectId":"$PROJECT","employeeId":"$BUDI_EMP","workDate":"$TODAY","status":"present"}}
]}
JSON
)"
conflict_status="$(http_status POST "$BASE_URL/api/core/sync" "$conflict_file" -H "authorization: Bearer $BUDI_TOKEN_2" -H 'content-type: application/json' --data "$conflict_body")"
expect_status 409 "$conflict_status" "$conflict_file" "stale revision conflict"
node - "$conflict_file" <<'NODE'
const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (d.error !== 'REVISION_CONFLICT') throw new Error('expected REVISION_CONFLICT');
NODE

echo "M7 authenticated production UAT PASS: login/session, tenant isolation, device binding/reset, field writes, idempotency, conflict handling, analytics scopes, reports read, admin boundaries"
