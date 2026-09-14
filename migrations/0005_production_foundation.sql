-- Milestone 1 production foundation (namespaced core schema).
-- Additive only: core_* tables are isolated from legacy MVP/D1 tables.
-- No existing table is altered or dropped in this milestone.

CREATE TABLE IF NOT EXISTS core_organizations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','suspended')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS core_organization_users (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('head','manager','supervisor','employee','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, user_id),
  UNIQUE (user_id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_org_users_user
  ON core_organization_users(user_id, status);
CREATE INDEX IF NOT EXISTS idx_core_org_users_role
  ON core_organization_users(organization_id, role, status);

CREATE TABLE IF NOT EXISTS core_clients (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_clients_scope
  ON core_clients(organization_id, status);

CREATE TABLE IF NOT EXISTS core_projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','paused','closed','archived')),
  starts_on TEXT,
  ends_on TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id)
    REFERENCES core_clients(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_projects_scope
  ON core_projects(organization_id, client_id, status);

CREATE TABLE IF NOT EXISTS core_project_memberships (
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('manager','supervisor','employee')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, project_id, user_id),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_core_project_memberships_user
  ON core_project_memberships(organization_id, user_id, status);

CREATE TABLE IF NOT EXISTS core_employees (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  auth_user_id TEXT,
  employee_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active'
    CHECK(employment_status IN ('active','inactive','terminated')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, employee_code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (auth_user_id, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_employees_scope
  ON core_employees(organization_id, employment_status);

CREATE TABLE IF NOT EXISTS core_employee_project_assignments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  supervisor_user_id TEXT,
  position_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','ended')),
  starts_on TEXT,
  ends_on TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES core_employees(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (supervisor_user_id, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_core_active_employee_assignment
  ON core_employee_project_assignments(organization_id, project_id, employee_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS core_outlets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  latitude REAL CHECK(latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude REAL CHECK(longitude IS NULL OR longitude BETWEEN -180 AND 180),
  geofence_radius_m INTEGER CHECK(geofence_radius_m IS NULL OR geofence_radius_m > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, client_id, code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id)
    REFERENCES core_clients(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_outlets_scope
  ON core_outlets(organization_id, client_id, status);

CREATE TABLE IF NOT EXISTS core_project_outlets (
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, project_id, outlet_id),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES core_outlets(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS core_visits (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK(status IN ('planned','in_progress','completed','cancelled','rejected')),
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  start_latitude REAL CHECK(start_latitude IS NULL OR start_latitude BETWEEN -90 AND 90),
  start_longitude REAL CHECK(start_longitude IS NULL OR start_longitude BETWEEN -180 AND 180),
  end_latitude REAL CHECK(end_latitude IS NULL OR end_latitude BETWEEN -90 AND 90),
  end_longitude REAL CHECK(end_longitude IS NULL OR end_longitude BETWEEN -180 AND 180),
  idempotency_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES core_outlets(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES core_employees(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_visits_project
  ON core_visits(organization_id, project_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_core_visits_employee
  ON core_visits(organization_id, employee_id, status, scheduled_at);

CREATE TABLE IF NOT EXISTS core_attendance (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present'
    CHECK(status IN ('present','late','absent','leave','rejected')),
  check_in_at TEXT,
  check_out_at TEXT,
  check_in_latitude REAL CHECK(check_in_latitude IS NULL OR check_in_latitude BETWEEN -90 AND 90),
  check_in_longitude REAL CHECK(check_in_longitude IS NULL OR check_in_longitude BETWEEN -180 AND 180),
  check_out_latitude REAL CHECK(check_out_latitude IS NULL OR check_out_latitude BETWEEN -90 AND 90),
  check_out_longitude REAL CHECK(check_out_longitude IS NULL OR check_out_longitude BETWEEN -180 AND 180),
  idempotency_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, project_id, employee_id, work_date),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES core_employees(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_attendance_project
  ON core_attendance(organization_id, project_id, work_date);
CREATE INDEX IF NOT EXISTS idx_core_attendance_employee
  ON core_attendance(organization_id, employee_id, work_date);

CREATE TABLE IF NOT EXISTS core_products (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, client_id, sku),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id)
    REFERENCES core_clients(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_products_scope
  ON core_products(organization_id, client_id, status);

CREATE TABLE IF NOT EXISTS core_product_sales (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK(quantity >= 0),
  unit_price REAL CHECK(unit_price IS NULL OR unit_price >= 0),
  total_amount REAL CHECK(total_amount IS NULL OR total_amount >= 0),
  sold_at TEXT NOT NULL,
  idempotency_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES core_outlets(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES core_employees(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, organization_id)
    REFERENCES core_products(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_sales_project
  ON core_product_sales(organization_id, project_id, sold_at);

CREATE TABLE IF NOT EXISTS core_survey_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','closed','archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  starts_at TEXT,
  ends_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id)
    REFERENCES core_clients(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_survey_templates_scope
  ON core_survey_templates(organization_id, project_id, status);

CREATE TABLE IF NOT EXISTS core_survey_questions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  question_type TEXT NOT NULL,
  label TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)),
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, template_id, position),
  FOREIGN KEY (template_id, organization_id)
    REFERENCES core_survey_templates(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS core_survey_responses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT,
  employee_id TEXT NOT NULL,
  visit_id TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('draft','submitted','rejected')),
  answers_json TEXT NOT NULL DEFAULT '{}',
  submitted_at TEXT,
  idempotency_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (template_id, organization_id)
    REFERENCES core_survey_templates(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES core_outlets(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES core_employees(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (visit_id, organization_id)
    REFERENCES core_visits(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_survey_responses_scope
  ON core_survey_responses(organization_id, project_id, submitted_at);

CREATE TABLE IF NOT EXISTS core_field_evidence (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT,
  employee_id TEXT NOT NULL,
  visit_id TEXT,
  evidence_type TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  captured_at TEXT,
  latitude REAL CHECK(latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude REAL CHECK(longitude IS NULL OR longitude BETWEEN -180 AND 180),
  content_sha256 TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, object_key),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES core_outlets(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES core_employees(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (visit_id, organization_id)
    REFERENCES core_visits(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_evidence_project
  ON core_field_evidence(organization_id, project_id, created_at);

CREATE TABLE IF NOT EXISTS core_operational_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  actor_user_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  project_id TEXT,
  client_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'success' CHECK(outcome IN ('success','denied','failed')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_audit_scope
  ON core_operational_audit_logs(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS core_api_idempotency_keys (
  organization_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_user_id TEXT,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, idempotency_key),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_idempotency_expiry
  ON core_api_idempotency_keys(expires_at);

CREATE TABLE IF NOT EXISTS core_legacy_import_batches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_version TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','validating','ready','importing','completed','failed')),
  records_total INTEGER NOT NULL DEFAULT 0 CHECK(records_total >= 0),
  records_imported INTEGER NOT NULL DEFAULT 0 CHECK(records_imported >= 0),
  records_failed INTEGER NOT NULL DEFAULT 0 CHECK(records_failed >= 0),
  checksum_sha256 TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_import_status
  ON core_legacy_import_batches(organization_id, status, created_at DESC);
