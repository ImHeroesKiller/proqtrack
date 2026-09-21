-- M7 follow-up — production bulk employee upload audit/state.
-- No plaintext passwords or uploaded source files are stored in D1.

CREATE TABLE IF NOT EXISTS core_bulk_import_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'employees'
    CHECK(entity_type IN ('employees')),
  source_name TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed')),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count >= 0),
  inserted_count INTEGER NOT NULL DEFAULT 0 CHECK(inserted_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK(updated_count >= 0),
  login_created_count INTEGER NOT NULL DEFAULT 0 CHECK(login_created_count >= 0),
  login_linked_count INTEGER NOT NULL DEFAULT 0 CHECK(login_linked_count >= 0),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK(warning_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK(error_count >= 0),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES auth_users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_bulk_import_runs_org
  ON core_bulk_import_runs(organization_id, created_at);

CREATE TABLE IF NOT EXISTS core_bulk_import_chunks (
  import_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK(status IN ('completed','failed')),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (import_id, chunk_id),
  FOREIGN KEY (import_id, organization_id) REFERENCES core_bulk_import_runs(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_core_bulk_import_chunks_org
  ON core_bulk_import_chunks(organization_id, created_at);
