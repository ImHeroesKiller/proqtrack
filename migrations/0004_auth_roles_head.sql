-- Expand auth_users.role CHECK to include Head (org admin).
-- SQLite cannot ALTER CHECK; rebuild the table.

CREATE TABLE IF NOT EXISTS auth_users_v2 (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('superadmin','head','manager','supervisor','employee','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','suspended')),
  project_ids TEXT NOT NULL DEFAULT '[]',
  client_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

INSERT INTO auth_users_v2 (id, email, password_hash, role, status, project_ids, client_ids, created_at, last_login_at)
SELECT id, email, password_hash, role, status, project_ids, client_ids, created_at, last_login_at
FROM auth_users;

DROP TABLE auth_users;
ALTER TABLE auth_users_v2 RENAME TO auth_users;

CREATE INDEX IF NOT EXISTS idx_auth_users_status
  ON auth_users(status, role);
