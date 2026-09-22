-- Correct the approved production recovery credential hash.
-- The gateway upgrades this legacy SHA-256 value to PBKDF2 after login.
UPDATE auth_users
SET password_hash='sha256$da2c6d434e34d4d9ee60f04dab3d74f43a685ebca713fff2ca1fac5a3e24734d',
    role='superadmin',
    status='active'
WHERE lower(email)='superadmin@proqtrack.id';
