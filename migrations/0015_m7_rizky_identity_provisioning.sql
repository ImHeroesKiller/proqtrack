-- M7 authenticated UAT readiness — provision missing MKB supervisor identity safely.
-- The credential hash is intentionally non-user-facing and the MKB organization membership
-- starts suspended. A Superadmin/Head must set the final password and activate the account
-- through Account Management before human use.

INSERT INTO auth_users(
  id,email,password_hash,role,status,project_ids,client_ids,created_at
)
SELECT
  'USR-MKB-RIZKY-PROVISIONED',
  'rizky.pratama@proqtrack.id',
  'pbkdf2$sha256$100000$71Fae_AKKQKhXUymr_YhVw$b0Pt2Y15H4oG8c1Nr0sN3P_UaAQ_3twNzf3JXbIhhfk',
  'supervisor',
  'active',
  '[]',
  '[]',
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM auth_users WHERE lower(email)='rizky.pratama@proqtrack.id'
);

INSERT OR IGNORE INTO core_organization_users(
  organization_id,user_id,role,status,created_at,updated_at
)
SELECT
  'ORG-MKB',id,'supervisor','suspended',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM auth_users
WHERE lower(email)='rizky.pratama@proqtrack.id';

UPDATE core_employees
SET auth_user_id=(
      SELECT id FROM auth_users
      WHERE lower(email)='rizky.pratama@proqtrack.id'
      LIMIT 1
    ),
    updated_at=CURRENT_TIMESTAMP
WHERE organization_id='ORG-MKB'
  AND id='EMP-MKB-RIZKY';

INSERT OR IGNORE INTO core_project_memberships(
  organization_id,project_id,user_id,role,status,created_at,updated_at
)
SELECT
  'ORG-MKB','PRJ-MKB-SALES-UAT',id,'supervisor','inactive',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM auth_users
WHERE lower(email)='rizky.pratama@proqtrack.id';

UPDATE core_employee_project_assignments
SET supervisor_user_id=(
      SELECT id FROM auth_users
      WHERE lower(email)='rizky.pratama@proqtrack.id'
      LIMIT 1
    ),
    updated_at=CURRENT_TIMESTAMP
WHERE organization_id='ORG-MKB'
  AND employee_id IN ('EMP-MKB-BUDI','EMP-MKB-NADIA');
