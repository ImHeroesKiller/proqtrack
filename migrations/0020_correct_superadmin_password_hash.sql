-- Retained for migration ordering compatibility.
-- Recovery password mutation was retired: credentials are never reset from SQL
-- stored in the repository.
UPDATE auth_users
SET role='superadmin'
WHERE lower(email)='superadmin@proqtrack.id';
