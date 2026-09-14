-- Milestone 2 — Unified Auth & Tenant Security
-- Server-side sessions and tenant membership become authoritative for API access.

CREATE TABLE IF NOT EXISTS core_auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT,
  role_at_issue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','revoked','expired')),
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT,
  created_ip_hash TEXT,
  user_agent_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_auth_sessions_user
  ON core_auth_sessions(user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_core_auth_sessions_org
  ON core_auth_sessions(organization_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_core_auth_sessions_expiry
  ON core_auth_sessions(status, expires_at);

-- Existing browser data uses ORG-DEFAULT as the canonical tenant. Bootstrap the
-- same tenant in D1 so existing server users can keep authenticating while the
-- operational data migration is completed in Milestone 3.
INSERT OR IGNORE INTO core_organizations (
  id, code, name, status, timezone, created_at, updated_at
) VALUES (
  'ORG-DEFAULT', 'DEMO', 'Organisasi Demo', 'active', 'Asia/Jakarta',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Backfill server-side organization membership from the existing auth user role.
-- Project/client scope is intentionally NOT copied from auth_users JSON claims;
-- those scopes must come from normalized core_project_memberships/core_projects.
INSERT OR IGNORE INTO core_organization_users (
  organization_id, user_id, role, status, created_at, updated_at
)
SELECT
  'ORG-DEFAULT',
  id,
  CASE role
    WHEN 'head' THEN 'head'
    WHEN 'admin' THEN 'admin'
    WHEN 'manager' THEN 'manager'
    WHEN 'supervisor' THEN 'supervisor'
    ELSE 'employee'
  END,
  CASE
    WHEN status = 'active' THEN 'active'
    WHEN status = 'suspended' THEN 'suspended'
    ELSE 'inactive'
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM auth_users
WHERE role <> 'superadmin';
