-- Guarantee that the documented recovery administrator exists in authoritative D1.
-- The legacy SHA-256 value matches the existing offline seed and is upgraded to
-- PBKDF2 automatically by the authentication gateway after the first login.

INSERT INTO auth_users(
  id,email,password_hash,role,status,project_ids,client_ids,created_at
)
SELECT
  'ACC-SUPER',
  'superadmin@proqtrack.id',
  'sha256$899169b9613ef73ec345b82b78242916491ff2535b3743c99e74606125e4375c',
  'superadmin',
  'active',
  '[]',
  '[]',
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM auth_users WHERE lower(email)='superadmin@proqtrack.id'
);

-- Restore the explicitly approved recovery credential and authorization state.
UPDATE auth_users
SET password_hash='sha256$899169b9613ef73ec345b82b78242916491ff2535b3743c99e74606125e4375c',
    role='superadmin',
    status='active'
WHERE lower(email)='superadmin@proqtrack.id';
