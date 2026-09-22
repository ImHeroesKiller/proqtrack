-- Production superadmin identity bootstrap.
-- Security rule: repository migrations must never contain a reusable recovery
-- credential or password verifier. A fresh environment receives a suspended,
-- non-login placeholder and must be provisioned explicitly by an operator.

INSERT INTO auth_users(
  id,email,password_hash,role,status,project_ids,client_ids,created_at
)
SELECT
  'ACC-SUPER',
  'superadmin@proqtrack.id',
  'disabled$operator-provisioning-required',
  'superadmin',
  'suspended',
  '[]',
  '[]',
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM auth_users WHERE lower(email)='superadmin@proqtrack.id'
);

-- Never reset an existing production password or status from a migration.
UPDATE auth_users
SET role='superadmin'
WHERE lower(email)='superadmin@proqtrack.id';
