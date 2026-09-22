-- Align the explicitly approved recovery credential with verifyPassword(),
-- which hashes legacy credentials as SHA-256(password + "|proqtrack.v1").
UPDATE auth_users
SET password_hash='sha256$53d8df577ff12695fb02c03d92e4e3d119a717e2ed89036a7ffbb053cef924d3',
    role='superadmin',
    status='active'
WHERE lower(email)='superadmin@proqtrack.id';
