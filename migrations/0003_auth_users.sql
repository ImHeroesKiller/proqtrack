CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('superadmin','manager','supervisor','employee','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','suspended')),
  project_ids TEXT NOT NULL DEFAULT '[]',
  client_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_users_status
  ON auth_users(status, role);
