-- Milestone 1 production foundation.
-- Additive only: legacy MVP tables remain available while operational data moves
-- from browser localStorage to server-authoritative D1 in later milestones.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','suspended')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_users (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL
    CHECK(role IN ('head','manager','supervisor','employee','admin')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, user_id),
  UNIQUE (user_id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_organization_users_user
  ON organization_users(user_id, status);
CREATE INDEX IF NOT EXISTS idx_organization_users_role
  ON organization_users(organization_id, role, status);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_clients_org_status
  ON clients(organization_id, status);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('draft','active','paused','closed','archived')),
  starts_on TEXT,
  ends_on TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id)
    REFERENCES clients(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_projects_org_client_status
  ON projects(organization_id, client_id, status);

CREATE TABLE IF NOT EXISTS project_memberships (
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL
    CHECK(role IN ('manager','supervisor','employee')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, project_id, user_id),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, organization_id)
    REFERENCES organization_users(user_id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_memberships_user
  ON project_memberships(organization_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_project_memberships_project
  ON project_memberships(organization_id, project_id, role, status);

CREATE TABLE IF NOT EXISTS employees (
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
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (auth_user_id, organization_id)
    REFERENCES organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_employees_org_status
  ON employees(organization_id, employment_status);
CREATE INDEX IF NOT EXISTS idx_employees_auth_user
  ON employees(organization_id, auth_user_id);

CREATE TABLE IF NOT EXISTS employee_project_assignments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  supervisor_user_id TEXT,
  position_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','ended')),
  starts_on TEXT,
  ends_on TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (supervisor_user_id, organization_id)
    REFERENCES organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_active_project_assignment
  ON employee_project_assignments(organization_id, project_id, employee_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_employee_assignments_supervisor
  ON employee_project_assignments(organization_id, supervisor_user_id, status);

CREATE TABLE IF NOT EXISTS outlets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  latitude REAL CHECK(latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude REAL CHECK(longitude IS NULL OR longitude BETWEEN -180 AND 180),
  geofence_radius_m INTEGER CHECK(geofence_radius_m IS NULL OR geofence_radius_m > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, client_id, code),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id)
    REFERENCES clients(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_outlets_org_client_status
  ON outlets(organization_id, client_id, status);

CREATE TABLE IF NOT EXISTS project_outlets (
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, project_id, outlet_id),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES outlets(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visits (
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
  metadata_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES outlets(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_visits_project_date
  ON visits(organization_id, project_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_visits_employee_status
  ON visits(organization_id, employee_id, status, scheduled_at);

CREATE TABLE IF NOT EXISTS attendance (
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
  check_in_distance_m REAL CHECK(check_in_distance_m IS NULL OR check_in_distance_m >= 0),
  check_out_distance_m REAL CHECK(check_out_distance_m IS NULL OR check_out_distance_m >= 0),
  idempotency_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, project_id, employee_id, work_date),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_attendance_project_date
  ON attendance(organization_id, project_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date
  ON attendance(organization_id, employee_id, work_date);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, client_id, sku),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id)
    REFERENCES clients(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_products_org_client_status
  ON products(organization_id, client_id, status);

CREATE TABLE IF NOT EXISTS product_sales (
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
    REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES outlets(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, organization_id)
    REFERENCES products(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sales_project_sold_at
  ON product_sales(organization_id, project_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_employee_sold_at
  ON product_sales(organization_id, employee_id, sold_at);

CREATE TABLE IF NOT EXISTS survey_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','active','closed','archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  starts_at TEXT,
  ends_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, organization_id)
    REFERENCES clients(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, organization_id)
    REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by, organization_id)
    REFERENCES organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_survey_templates_scope
  ON survey_templates(organization_id, project_id, status);

CREATE TABLE IF NOT EXISTS survey_questions (
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
    REFERENCES survey_templates(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT,
  employee_id TEXT NOT NULL,
  visit_id TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK(status IN ('draft','submitted','rejected')),
  submitted_at TEXT,
  idempotency_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (template_id, organization_id)
    REFERENCES survey_templates(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, organization_id)
    REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES outlets(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (visit_id, organization_id)
    REFERENCES visits(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_project
  ON survey_responses(organization_id, project_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_survey_responses_employee
  ON survey_responses(organization_id, employee_id, submitted_at);

CREATE TABLE IF NOT EXISTS survey_answers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  response_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, response_id, question_id),
  FOREIGN KEY (response_id, organization_id)
    REFERENCES survey_responses(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, organization_id)
    REFERENCES survey_questions(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS field_evidence (
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
    REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (outlet_id, organization_id)
    REFERENCES outlets(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (visit_id, organization_id)
    REFERENCES visits(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_field_evidence_project
  ON field_evidence(organization_id, project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_field_evidence_employee
  ON field_evidence(organization_id, employee_id, created_at);

CREATE TABLE IF NOT EXISTS operational_audit_logs (
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
  outcome TEXT NOT NULL DEFAULT 'success'
    CHECK(outcome IN ('success','denied','failed')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id, organization_id)
    REFERENCES organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_operational_audit_org_created
  ON operational_audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_audit_actor
  ON operational_audit_logs(organization_id, actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_audit_project
  ON operational_audit_logs(organization_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
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
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id, organization_id)
    REFERENCES organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expiry
  ON api_idempotency_keys(expires_at);

CREATE TABLE IF NOT EXISTS legacy_import_batches (
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
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by, organization_id)
    REFERENCES organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_legacy_import_batches_status
  ON legacy_import_batches(organization_id, status, created_at DESC);

-- Prepare existing MVP sidecar tables to carry tenant context during the
-- transition. Fields remain nullable until Milestone 2/3 server enforcement.
ALTER TABLE file_metadata ADD COLUMN organization_id TEXT;
ALTER TABLE file_metadata ADD COLUMN client_id TEXT;
CREATE INDEX IF NOT EXISTS idx_file_metadata_org_project
  ON file_metadata(organization_id, project_id, created_at DESC);

ALTER TABLE security_audit_logs ADD COLUMN organization_id TEXT;
CREATE INDEX IF NOT EXISTS idx_security_audit_org_created
  ON security_audit_logs(organization_id, created_at DESC);

ALTER TABLE report_generation_jobs ADD COLUMN organization_id TEXT;
CREATE INDEX IF NOT EXISTS idx_report_jobs_org_status
  ON report_generation_jobs(organization_id, status, created_at);
