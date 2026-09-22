-- P2 hardening — complete cloud authority for remaining operational records.
-- Price observations, competitor intel, and outlet proposals were previously
-- device-local. These tables make them tenant-scoped and revision-controlled.

CREATE TABLE IF NOT EXISTS core_price_observations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  visit_id TEXT,
  observed_price REAL NOT NULL DEFAULT 0 CHECK(observed_price >= 0),
  discount_percent REAL NOT NULL DEFAULT 0 CHECK(discount_percent >= 0 AND discount_percent <= 100),
  discount_amount REAL NOT NULL DEFAULT 0 CHECK(discount_amount >= 0),
  notes TEXT,
  recorded_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, organization_id) REFERENCES core_projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id, organization_id) REFERENCES core_outlets(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, organization_id) REFERENCES core_products(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id, organization_id) REFERENCES core_employees(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (visit_id, organization_id) REFERENCES core_visits(id, organization_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_core_price_observations_scope
  ON core_price_observations(organization_id, project_id, outlet_id, product_id, recorded_at);

CREATE TABLE IF NOT EXISTS core_competitor_intel (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  product_id TEXT,
  competitor_product_id TEXT,
  employee_id TEXT NOT NULL,
  visit_id TEXT,
  our_price REAL NOT NULL DEFAULT 0 CHECK(our_price >= 0),
  competitor_price REAL NOT NULL DEFAULT 0 CHECK(competitor_price >= 0),
  shelf_share REAL NOT NULL DEFAULT 0 CHECK(shelf_share >= 0 AND shelf_share <= 100),
  visibility TEXT NOT NULL DEFAULT 'medium' CHECK(visibility IN ('high','medium','low')),
  has_promo INTEGER NOT NULL DEFAULT 0 CHECK(has_promo IN (0,1)),
  promo_type TEXT,
  promo_notes TEXT,
  notes TEXT,
  recorded_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, organization_id) REFERENCES core_projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id, organization_id) REFERENCES core_outlets(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, organization_id) REFERENCES core_products(id, organization_id) ON DELETE SET NULL,
  FOREIGN KEY (competitor_product_id, organization_id) REFERENCES core_competitor_products(id, organization_id) ON DELETE SET NULL,
  FOREIGN KEY (employee_id, organization_id) REFERENCES core_employees(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (visit_id, organization_id) REFERENCES core_visits(id, organization_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_core_competitor_intel_scope
  ON core_competitor_intel(organization_id, project_id, outlet_id, employee_id, recorded_at);

CREATE TABLE IF NOT EXISTS core_outlet_proposals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  supervisor_status TEXT NOT NULL DEFAULT 'pending' CHECK(supervisor_status IN ('pending','approved','rejected')),
  manager_status TEXT NOT NULL DEFAULT 'pending' CHECK(manager_status IN ('pending','approved','rejected')),
  submitted_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, organization_id) REFERENCES core_projects(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_core_outlet_proposals_scope
  ON core_outlet_proposals(organization_id, project_id, status, submitted_at);
