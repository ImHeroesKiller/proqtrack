-- M7 UAT hardening — authoritative field-device binding and account-management support.
-- Device secrets are never stored. Only server-side SHA-256 hashes of browser identifiers/proofs are retained.

CREATE TABLE IF NOT EXISTS core_auth_devices (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  device_id_hash TEXT NOT NULL,
  device_proof_hash TEXT NOT NULL,
  device_label TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','reset_pending')),
  paired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reset_at TEXT,
  reset_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (user_id, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_core_auth_devices_status
  ON core_auth_devices(organization_id, status, updated_at);
