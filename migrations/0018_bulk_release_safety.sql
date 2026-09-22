-- Additive release guard: existing catalog and local intel are retained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_state_revision ON core_sync_state(organization_id,revision);
CREATE TABLE IF NOT EXISTS core_sync_revision_guards (
  organization_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  PRIMARY KEY(organization_id,mutation_id),
  FOREIGN KEY(organization_id,expected_revision) REFERENCES core_sync_state(organization_id,revision)
);
CREATE TABLE IF NOT EXISTS core_master_bulk_receipts (
  organization_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  chunk_id INTEGER NOT NULL CHECK(chunk_id > 0),
  total_chunks INTEGER NOT NULL CHECK(total_chunks >= chunk_id AND total_chunks <= 20),
  entity TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  applied_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(organization_id,actor_user_id,import_id,chunk_id)
);
