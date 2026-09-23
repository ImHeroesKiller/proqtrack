#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PROQTRACK_BASE_URL:-https://proqtrack.arywibowo.workers.dev}"
RUN_KEY="${GITHUB_RUN_ID:-$(date +%s)}-${GITHUB_RUN_ATTEMPT:-1}"
SAFE_KEY="$(printf '%s' "$RUN_KEY" | tr -cd '[:alnum:]-' | cut -c1-40)"
UAT_ORG="ORG-FULL-UAT-$SAFE_KEY"
UAT_PROJECT="PRJ-FULL-UAT-$SAFE_KEY"
UAT_CLIENT="CL-FULL-UAT-$SAFE_KEY"
UAT_SUPER_ID="ACC-FULL-UAT-SUPER-$SAFE_KEY"
UAT_SUPER_EMAIL="uat.full.super.$SAFE_KEY@proqtrack.id"
UAT_SUPER_PASS="$(openssl rand -hex 24)"
UAT_SUPER_HASH=""
WRAP_TMP="${RUNNER_TEMP:-/tmp}/proqtrack-full-uat-wrapper-$SAFE_KEY"
ARTIFACT_DIR="${GITHUB_WORKSPACE:-.}/uat-artifacts"
mkdir -p "$WRAP_TMP" "$ARTIFACT_DIR"
chmod 700 "$WRAP_TMP"
echo "::add-mask::$UAT_SUPER_PASS"

UAT_SUPER_HASH="$(node - "$UAT_SUPER_PASS" <<'NODE'
const crypto=require('crypto');
const plain=process.argv[2], salt=crypto.randomBytes(16), iterations=600000;
const derived=crypto.pbkdf2Sync(Buffer.from(plain),salt,iterations,32,'sha256');
const b=x=>Buffer.from(x).toString('base64url');
process.stdout.write(`pbkdf2$sha256$${iterations}$${b(salt)}$${b(derived)}`);
NODE
)"

d1_exec_outer() {
  npx wrangler d1 execute DB --remote --env="" --command "$1" >/dev/null
}

master_cleanup() {
  set +e
  d1_exec_outer "
    DELETE FROM core_report_schedules WHERE organization_id='$UAT_ORG';
    DELETE FROM report_generation_jobs WHERE organization_id='$UAT_ORG';
    DELETE FROM core_outlet_proposals WHERE organization_id='$UAT_ORG';
    DELETE FROM core_competitor_intel WHERE organization_id='$UAT_ORG';
    DELETE FROM core_price_observations WHERE organization_id='$UAT_ORG';
    DELETE FROM core_stocks WHERE organization_id='$UAT_ORG';
    DELETE FROM core_leaves WHERE organization_id='$UAT_ORG';
    DELETE FROM core_survey_responses WHERE organization_id='$UAT_ORG';
    DELETE FROM core_product_sales WHERE organization_id='$UAT_ORG';
    DELETE FROM core_attendance WHERE organization_id='$UAT_ORG';
    DELETE FROM core_visits WHERE organization_id='$UAT_ORG';
    DELETE FROM core_survey_templates WHERE organization_id='$UAT_ORG';
    DELETE FROM core_competitor_products WHERE organization_id='$UAT_ORG';
    DELETE FROM core_competitors WHERE organization_id='$UAT_ORG';
    DELETE FROM core_project_products WHERE organization_id='$UAT_ORG';
    DELETE FROM core_products WHERE organization_id='$UAT_ORG';
    DELETE FROM core_project_outlets WHERE organization_id='$UAT_ORG';
    DELETE FROM core_outlets WHERE organization_id='$UAT_ORG';
    DELETE FROM core_employee_project_assignments WHERE organization_id='$UAT_ORG';
    DELETE FROM core_employees WHERE organization_id='$UAT_ORG';
    DELETE FROM core_project_memberships WHERE organization_id='$UAT_ORG';
    DELETE FROM core_projects WHERE organization_id='$UAT_ORG';
    DELETE FROM core_clients WHERE organization_id='$UAT_ORG';
    DELETE FROM core_auth_sessions WHERE user_id='$UAT_SUPER_ID';
    DELETE FROM core_auth_devices WHERE user_id='$UAT_SUPER_ID';
    DELETE FROM core_organization_users WHERE organization_id='$UAT_ORG';
    DELETE FROM core_sync_state WHERE organization_id='$UAT_ORG';
    DELETE FROM core_organizations WHERE id='$UAT_ORG';
    DELETE FROM auth_users WHERE id='$UAT_SUPER_ID';
    DELETE FROM security_audit_logs WHERE actor_id='$UAT_SUPER_ID';
  " >/dev/null 2>&1 || true
  rm -rf "$WRAP_TMP"
}

full_cleanup() {
  set +e
  if declare -F cleanup >/dev/null 2>&1; then cleanup || true; fi
  master_cleanup || true
}
trap full_cleanup EXIT

echo "Seeding isolated production UAT tenant: $UAT_ORG"
d1_exec_outer "
  INSERT INTO core_organizations(id,code,name,status,timezone,created_at,updated_at)
    VALUES('$UAT_ORG','FULLUAT$SAFE_KEY','000 Full Production UAT','active','Asia/Jakarta',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  INSERT INTO core_sync_state(organization_id,revision,cutover_mode,imported_at,updated_at)
    VALUES('$UAT_ORG',0,'cloud',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  INSERT INTO core_clients(id,organization_id,code,name,status,metadata_json,created_at,updated_at)
    VALUES('$UAT_CLIENT','$UAT_ORG','FMCG-UAT','FMCG Full UAT','active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  INSERT INTO core_projects(id,organization_id,client_id,code,name,status,starts_on,metadata_json,created_at,updated_at)
    VALUES('$UAT_PROJECT','$UAT_ORG','$UAT_CLIENT','SALES-UAT','Sales Execution Full UAT','active','2026-09-01','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

  INSERT INTO core_outlets(id,organization_id,client_id,code,name,address,latitude,longitude,geofence_radius_m,status,metadata_json,created_at,updated_at) VALUES
    ('OUT-MKB-001','$UAT_ORG','$UAT_CLIENT','OUT-001','UAT Outlet 1','Jakarta',-6.214620,106.822900,100,'active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('OUT-MKB-002','$UAT_ORG','$UAT_CLIENT','OUT-002','UAT Outlet 2','Jakarta',-6.220000,106.820000,100,'active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('OUT-MKB-003','$UAT_ORG','$UAT_CLIENT','OUT-003','UAT Outlet 3','Jakarta',-6.221000,106.821000,100,'active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('OUT-MKB-004','$UAT_ORG','$UAT_CLIENT','OUT-004','UAT Outlet 4','Jakarta',-6.222000,106.822000,100,'active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('OUT-MKB-005','$UAT_ORG','$UAT_CLIENT','OUT-005','UAT Outlet 5','Jakarta',-6.223000,106.823000,100,'active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('OUT-MKB-006','$UAT_ORG','$UAT_CLIENT','OUT-006','UAT Outlet 6','Jakarta',-6.224000,106.824000,100,'active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  INSERT INTO core_project_outlets(organization_id,project_id,outlet_id,status,created_at)
    SELECT '$UAT_ORG','$UAT_PROJECT',id,'active',CURRENT_TIMESTAMP FROM core_outlets WHERE organization_id='$UAT_ORG';

  INSERT INTO core_products(id,organization_id,client_id,sku,name,unit,status,metadata_json,created_at,updated_at) VALUES
    ('PROD-MKB-001','$UAT_ORG','$UAT_CLIENT','SKU-001','UAT Product 1','pcs','active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('PROD-MKB-002','$UAT_ORG','$UAT_CLIENT','SKU-002','UAT Product 2','pcs','active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('PROD-MKB-003','$UAT_ORG','$UAT_CLIENT','SKU-003','UAT Product 3','pcs','active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('PROD-MKB-004','$UAT_ORG','$UAT_CLIENT','SKU-004','UAT Product 4','pcs','active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('PROD-MKB-005','$UAT_ORG','$UAT_CLIENT','SKU-005','UAT Product 5','pcs','active','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  INSERT INTO core_project_products(organization_id,project_id,product_id,status,created_at,updated_at)
    SELECT '$UAT_ORG','$UAT_PROJECT',id,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM core_products WHERE organization_id='$UAT_ORG';

  INSERT INTO core_survey_templates(id,organization_id,client_id,project_id,name,status,version,starts_at,created_at,updated_at)
    VALUES('SURV-MKB-PERFECT-STORE','$UAT_ORG','$UAT_CLIENT','$UAT_PROJECT','Perfect Store UAT','active',1,'2026-09-01',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

  INSERT INTO auth_users(id,email,password_hash,role,status,project_ids,client_ids,created_at)
    VALUES('$UAT_SUPER_ID','$UAT_SUPER_EMAIL','$UAT_SUPER_HASH','superadmin','active','[]','[]',CURRENT_TIMESTAMP);
"

TEMP_SCRIPT="$WRAP_TMP/m7-uat.sh"
sed \
  -e "s/^ORG=\"ORG-MKB\"/ORG=\"$UAT_ORG\"/" \
  -e "s/^PROJECT=\"PRJ-MKB-SALES-UAT\"/PROJECT=\"$UAT_PROJECT\"/" \
  -e 's/^trap cleanup EXIT$/trap full_cleanup EXIT/' \
  scripts/m7-authenticated-production-uat.sh > "$TEMP_SCRIPT"
chmod +x "$TEMP_SCRIPT"

# Source the proven M7 API UAT so its ephemeral users/tokens remain available
# for the browser phase. The modified trap delegates to full_cleanup above.
source "$TEMP_SCRIPT"

echo "Extending UAT to P2 operational collections"
COMP_ID="CMP-FULL-$SAFE_KEY"
CPD_ID="CPD-FULL-$SAFE_KEY"
d1_exec_outer "
  INSERT INTO core_competitors(id,organization_id,code,name,status,metadata_json,row_version,created_at,updated_at)
    VALUES('$COMP_ID','$UAT_ORG','CMP-FULL','UAT Competitor','active','{}',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  INSERT INTO core_competitor_products(id,organization_id,competitor_id,sku,name,unit,typical_price,status,metadata_json,row_version,created_at,updated_at)
    VALUES('$CPD_ID','$UAT_ORG','$COMP_ID','CMP-SKU','UAT Competitor Product','pcs',12000,'active','{}',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
"

LATEST="$WRAP_TMP/latest-nadia.json"
LATEST_STATUS="$(http_status GET "$BASE_URL/api/core/bootstrap" "$LATEST" -H "authorization: Bearer $NADIA_TOKEN")"
expect_status 200 "$LATEST_STATUS" "$LATEST" "Nadia latest bootstrap"
LATEST_REV="$(json_value "$LATEST" revision)"
NOW_FULL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TODAY_FULL="$(date -u +%Y-%m-%d)"
P2_FILE="$WRAP_TMP/p2-sync.json"
P2_BODY="$(cat <<JSON
{"mutationId":"FULL-P2-$SAFE_KEY","baseRevision":$LATEST_REV,"changes":[
  {"entity":"stocks","op":"upsert","row":{"id":"STK-FULL-$SAFE_KEY","projectId":"$UAT_PROJECT","outletId":"OUT-MKB-002","productId":"PROD-MKB-002","quantity":8,"minStock":5,"updatedBy":"$NADIA_EMP","lastUpdated":"$TODAY_FULL"}},
  {"entity":"priceObservations","op":"upsert","row":{"id":"PRC-FULL-$SAFE_KEY","projectId":"$UAT_PROJECT","outletId":"OUT-MKB-002","productId":"PROD-MKB-002","employeeId":"$NADIA_EMP","observedPrice":12500,"discountPercent":5,"discountAmount":625,"notes":"Full UAT","recordedAt":"$NOW_FULL"}},
  {"entity":"competitorIntel","op":"upsert","row":{"id":"INT-FULL-$SAFE_KEY","projectId":"$UAT_PROJECT","outletId":"OUT-MKB-002","productId":"PROD-MKB-002","competitorProductId":"$CPD_ID","employeeId":"$NADIA_EMP","ourPrice":13000,"competitorPrice":12000,"shelfShare":40,"visibility":"high","hasPromo":true,"promoType":"discount","notes":"Full UAT","recordedAt":"$NOW_FULL"}},
  {"entity":"outletProposals","op":"upsert","row":{"id":"OPR-FULL-$SAFE_KEY","projectId":"$UAT_PROJECT","outletId":"OUT-PROP-$SAFE_KEY","employeeId":"$NADIA_EMP","submittedBy":"$NADIA_EMP","name":"UAT Proposed Outlet","address":"Jakarta","status":"pending","supervisorStatus":"pending","managerStatus":"pending","submittedAt":"$NOW_FULL"}}
]}
JSON
)"
P2_STATUS="$(http_status POST "$BASE_URL/api/core/sync" "$P2_FILE" -H "authorization: Bearer $NADIA_TOKEN" -H 'content-type: application/json' --data "$P2_BODY")"
expect_status 200 "$P2_STATUS" "$P2_FILE" "P2 operational cloud sync"

echo "Testing superadmin direct tenant login before global session"
SUPER_DIRECT="$WRAP_TMP/super-direct.json"
SUPER_DIRECT_STATUS="$(http_status POST "$BASE_URL/api/auth/login" "$SUPER_DIRECT" -H 'content-type: application/json' --data "$(printf '{"email":"%s","password":"%s","organizationId":"%s"}' "$UAT_SUPER_EMAIL" "$UAT_SUPER_PASS" "$UAT_ORG")")"
expect_status 200 "$SUPER_DIRECT_STATUS" "$SUPER_DIRECT" "superadmin direct tenant login"
SUPER_DIRECT_TOKEN="$(json_value "$SUPER_DIRECT" token)"
SUPER_DIRECT_SESSION="$WRAP_TMP/super-direct-session.json"
SUPER_DIRECT_SESSION_STATUS="$(http_status GET "$BASE_URL/api/auth/session" "$SUPER_DIRECT_SESSION" -H "authorization: Bearer $SUPER_DIRECT_TOKEN")"
expect_status 200 "$SUPER_DIRECT_SESSION_STATUS" "$SUPER_DIRECT_SESSION" "superadmin direct tenant session"

echo "Inspecting production auth session schema before global superadmin login"
npx wrangler d1 execute DB --remote --env="" --command "PRAGMA table_info(core_auth_sessions);" || true

echo "Testing superadmin global login and tenant switch"
SUPER_LOGIN="$WRAP_TMP/super-login.json"
SUPER_LOGIN_STATUS="$(http_status POST "$BASE_URL/api/auth/login" "$SUPER_LOGIN" -H 'content-type: application/json' --data "$(printf '{"email":"%s","password":"%s"}' "$UAT_SUPER_EMAIL" "$UAT_SUPER_PASS")")"
expect_status 200 "$SUPER_LOGIN_STATUS" "$SUPER_LOGIN" "superadmin global login"
SUPER_GLOBAL_TOKEN="$(json_value "$SUPER_LOGIN" token)"
SUPER_SWITCH="$WRAP_TMP/super-switch.json"
SUPER_SWITCH_STATUS="$(http_status POST "$BASE_URL/api/auth/switch-organization" "$SUPER_SWITCH" -H "authorization: Bearer $SUPER_GLOBAL_TOKEN" -H 'content-type: application/json' --data "$(printf '{"organizationId":"%s"}' "$UAT_ORG")")"
expect_status 200 "$SUPER_SWITCH_STATUS" "$SUPER_SWITCH" "superadmin tenant switch"
SUPER_TOKEN="$(json_value "$SUPER_SWITCH" token)"
for path in /api/admin/organizations /api/admin/accounts /api/monitoring/summary /api/reports?limit=5; do
  file="$WRAP_TMP/super-$(printf '%s' "$path" | tr '/?=&' '----').json"
  status="$(http_status GET "$BASE_URL$path" "$file" -H "authorization: Bearer $SUPER_TOKEN")"
  expect_status 200 "$status" "$file" "superadmin GET $path"
done

echo "Resetting employee device bindings for browser UAT"
for user_id in "$BUDI_ID" "$NADIA_ID"; do
  file="$WRAP_TMP/reset-$user_id.json"
  status="$(http_status POST "$BASE_URL/api/admin/accounts/$user_id/reset-device" "$file" -H "authorization: Bearer $HEAD_TOKEN" -H 'content-type: application/json' --data '{}')"
  expect_status 200 "$status" "$file" "browser device reset $user_id"
done

CREDENTIALS_FILE="$WRAP_TMP/browser-credentials.json"
cat > "$CREDENTIALS_FILE" <<JSON
{
  "organization": {"id":"$UAT_ORG","code":"FULLUAT","name":"000 Full Production UAT"},
  "project": {"id":"$UAT_PROJECT","code":"SALES-UAT","name":"Sales Execution Full UAT"},
  "actors": {
    "budi": {"id":"$BUDI_ID","email":"$BUDI_EMAIL","password":"$BUDI_PASS","role":"employee","name":"UAT Merchandiser","employeeId":"$BUDI_EMP","employeeCode":"UAT-MERCH","supervisorEmployeeId":"$RIZKY_EMP"},
    "nadia": {"id":"$NADIA_ID","email":"$NADIA_EMAIL","password":"$NADIA_PASS","role":"employee","name":"UAT SPG","employeeId":"$NADIA_EMP","employeeCode":"UAT-SPG","supervisorEmployeeId":"$RIZKY_EMP"},
    "rizky": {"id":"$RIZKY_ID","email":"$RIZKY_EMAIL","password":"$RIZKY_PASS","role":"supervisor","name":"UAT Supervisor","employeeId":"$RIZKY_EMP","employeeCode":"UAT-SPV"},
    "manager": {"id":"$MANAGER_ID","email":"$MANAGER_EMAIL","password":"$MANAGER_PASS","role":"manager","name":"UAT Manager"},
    "head": {"id":"$HEAD_ID","email":"$HEAD_EMAIL","password":"$HEAD_PASS","role":"head","name":"UAT Head"},
    "superadmin": {"id":"$UAT_SUPER_ID","email":"$UAT_SUPER_EMAIL","password":"$UAT_SUPER_PASS","role":"superadmin","name":"UAT Superadmin"}
  }
}
JSON
chmod 600 "$CREDENTIALS_FILE"

PROQTRACK_BASE_URL="$BASE_URL" \
PROQTRACK_UAT_CREDENTIALS="$CREDENTIALS_FILE" \
PROQTRACK_UAT_ARTIFACT_DIR="$ARTIFACT_DIR" \
node scripts/full-production-browser-uat.mjs

cat > "$ARTIFACT_DIR/full-production-uat-summary.json" <<JSON
{
  "passed": true,
  "organization": "$UAT_ORG",
  "project": "$UAT_PROJECT",
  "apiBaseline": "M7 authenticated UAT + P2 operational collections + superadmin",
  "browserRoles": ["Merchandiser","SPG","Supervisor","Manager","Head","Superadmin"],
  "productionDataPolicy": "isolated ephemeral tenant; automatic cleanup"
}
JSON

echo "FULL_PRODUCTION_UAT_PASS: all six role/persona paths completed"
