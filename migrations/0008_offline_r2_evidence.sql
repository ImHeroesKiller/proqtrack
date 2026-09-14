-- Milestone 4 — Offline First + R2 Evidence
-- Adds evidence idempotency/audit columns and conflict receipts used by durable client replay.

ALTER TABLE core_field_evidence ADD COLUMN uploader_user_id TEXT;
ALTER TABLE core_field_evidence ADD COLUMN idempotency_key TEXT;
ALTER TABLE core_field_evidence ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE core_field_evidence ADD COLUMN updated_at TEXT;
UPDATE core_field_evidence SET updated_at=created_at WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_core_field_evidence_idempotency
  ON core_field_evidence(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_core_field_evidence_project_time
  ON core_field_evidence(organization_id, project_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS core_sync_conflicts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  client_revision INTEGER NOT NULL CHECK(client_revision >= 0),
  server_revision INTEGER NOT NULL CHECK(server_revision >= 0),
  resolution TEXT NOT NULL DEFAULT 'client_replay'
    CHECK(resolution IN ('client_replay','server_wins','manual')),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_sync_conflicts_org_time
  ON core_sync_conflicts(organization_id, created_at DESC);
