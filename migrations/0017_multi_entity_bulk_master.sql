-- M8 — Multi-entity bulk master + competitor cloud authority.

CREATE TABLE IF NOT EXISTS core_competitors (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','archived')),
  notes TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_competitors_scope
  ON core_competitors(organization_id, status, name);

CREATE TABLE IF NOT EXISTS core_competitor_products (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  competitor_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  typical_price REAL CHECK(typical_price IS NULL OR typical_price >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, competitor_id, sku),
  UNIQUE (id, organization_id),
  FOREIGN KEY (competitor_id, organization_id)
    REFERENCES core_competitors(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_core_competitor_products_scope
  ON core_competitor_products(organization_id, competitor_id, status);

CREATE TABLE IF NOT EXISTS core_competitor_intel (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT,
  employee_id TEXT NOT NULL,
  visit_id TEXT,
  competitor_id TEXT NOT NULL,
  competitor_product_id TEXT,
  product_id TEXT,
  our_price REAL NOT NULL DEFAULT 0 CHECK(our_price >= 0),
  competitor_price REAL NOT NULL DEFAULT 0 CHECK(competitor_price >= 0),
  shelf_share REAL NOT NULL DEFAULT 0 CHECK(shelf_share >= 0),
  visibility TEXT,
  has_promo INTEGER NOT NULL DEFAULT 0 CHECK(has_promo IN (0,1)),
  promo_type TEXT,
  promo_notes TEXT,
  notes TEXT,
  recorded_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES core_outlets(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES core_employees(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (visit_id, organization_id)
    REFERENCES core_visits(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (competitor_id, organization_id)
    REFERENCES core_competitors(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (competitor_product_id, organization_id)
    REFERENCES core_competitor_products(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, organization_id)
    REFERENCES core_products(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_competitor_intel_scope
  ON core_competitor_intel(organization_id, project_id, recorded_at);

CREATE TABLE IF NOT EXISTS core_bulk_master_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL
    CHECK(entity_type IN (
      'clients','projects','outlets','products',
      'competitors','competitorProducts','projectAssignments'
    )),
  source_name TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed')),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count >= 0),
  inserted_count INTEGER NOT NULL DEFAULT 0 CHECK(inserted_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK(updated_count >= 0),
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

CREATE INDEX IF NOT EXISTS idx_core_bulk_master_runs_org
  ON core_bulk_master_runs(organization_id, entity_type, created_at DESC);

CREATE TABLE IF NOT EXISTS core_bulk_master_chunks (
  import_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK(status IN ('completed','failed')),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count >= 0),
  inserted_count INTEGER NOT NULL DEFAULT 0 CHECK(inserted_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK(updated_count >= 0),
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (import_id, chunk_id),
  FOREIGN KEY (import_id, organization_id)
    REFERENCES core_bulk_master_runs(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_core_bulk_master_chunks_org
  ON core_bulk_master_chunks(organization_id, entity_type, created_at DESC);
