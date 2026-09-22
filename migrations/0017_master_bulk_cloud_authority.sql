-- Master data cloud authority for bulk import framework.
-- Promotes competitor catalog and attendance points from browser-local state to D1.

CREATE TABLE IF NOT EXISTS core_competitors (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_competitors_scope
  ON core_competitors(organization_id, status, code);

CREATE TABLE IF NOT EXISTS core_competitor_products (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  competitor_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  typical_price REAL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, competitor_id, sku),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (competitor_id, organization_id)
    REFERENCES core_competitors(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_core_competitor_products_scope
  ON core_competitor_products(organization_id, competitor_id, status);

CREATE TABLE IF NOT EXISTS core_attendance_points (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'point'
    CHECK(type IN ('office','meeting','store','point')),
  address TEXT,
  outlet_id TEXT,
  latitude REAL CHECK(latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude REAL CHECK(longitude IS NULL OR longitude BETWEEN -180 AND 180),
  radius_m INTEGER CHECK(radius_m IS NULL OR radius_m > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES core_outlets(id, organization_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_core_attendance_points_scope
  ON core_attendance_points(organization_id, status, type);
