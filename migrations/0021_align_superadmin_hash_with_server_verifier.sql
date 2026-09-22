-- Retained for migration ordering compatibility.
-- Legacy SHA-256 recovery hashes are intentionally not embedded in source.
-- Existing credentials are upgraded on successful login by the auth gateway.
UPDATE auth_users
SET role='superadmin'
WHERE lower(email)='superadmin@proqtrack.id';
