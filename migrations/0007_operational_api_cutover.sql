-- Milestone 3 — Operational API & Data Migration
-- Adds optimistic row versions, metadata preservation, normalized project-product mapping,
-- and per-tenant sync/cutover state.

ALTER TABLE core_clients ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE core_projects ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE core_employees ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE core_employee_project_assignments ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE core_employee_project_assignments ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE core_outlets ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE core_visits ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE core_attendance ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE core_products ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE core_product_sales ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE core_survey_templates ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE core_survey_templates ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE core_survey_responses ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS core_project_products (
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, project_id, product_id),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, organization_id)
    REFERENCES core_products(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_core_project_products_product
  ON core_project_products(organization_id, product_id, status);

CREATE TABLE IF NOT EXISTS core_sync_state (
  organization_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  cutover_mode TEXT NOT NULL DEFAULT 'pending'
    CHECK(cutover_mode IN ('pending','cloud')),
  last_mutation_id TEXT,
  imported_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS core_sync_mutations (
  organization_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  base_revision INTEGER NOT NULL CHECK(base_revision >= 0),
  applied_revision INTEGER NOT NULL CHECK(applied_revision >= 0),
  change_count INTEGER NOT NULL DEFAULT 0 CHECK(change_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, mutation_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_sync_mutations_revision
  ON core_sync_mutations(organization_id, applied_revision DESC);

INSERT INTO core_sync_state(organization_id, revision, cutover_mode, updated_at)
SELECT id, 0, 'pending', CURRENT_TIMESTAMP
FROM core_organizations
ON CONFLICT(organization_id) DO NOTHING;
