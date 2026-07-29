-- ProQTrack Phase 1: identity, organization hierarchy, and RBAC foundation
-- Additive migration only. Existing snapshot/report tables are not changed.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_number TEXT NOT NULL UNIQUE,
  nik TEXT UNIQUE,
  full_name TEXT NOT NULL,
  preferred_name TEXT,
  email TEXT,
  phone TEXT,
  gender TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (gender IN ('male','female','other','unspecified')),
  employment_type TEXT NOT NULL DEFAULT 'contract'
    CHECK (employment_type IN ('permanent','contract','outsourced','freelance','intern')),
  worker_type TEXT NOT NULL DEFAULT 'non_sales'
    CHECK (worker_type IN ('sales','non_sales','supervisor','manager','admin')),
  join_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','on_leave','suspended','resigned','terminated','inactive')),
  photo_url TEXT,
  photo_storage_key TEXT,
  photo_updated_at TEXT,
  attendance_policy_id TEXT,
  work_schedule_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (end_date IS NULL OR end_date >= join_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email_unique
  ON employees(lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_worker_type ON employees(worker_type);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  employee_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','active','suspended','locked','inactive')),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until TEXT,
  last_login_at TEXT,
  last_login_ip TEXT,
  password_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_unique
  ON accounts(lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_employee ON accounts(employee_id);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('executive','manager','supervisor','team_lead','staff','field_worker','support')),
  level_rank INTEGER NOT NULL CHECK (level_rank >= 0),
  can_manage_people INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_people IN (0,1)),
  can_review_attendance INTEGER NOT NULL DEFAULT 0 CHECK (can_review_attendance IN (0,1)),
  can_approve INTEGER NOT NULL DEFAULT 0 CHECK (can_approve IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_positions_rank ON positions(level_rank DESC);
CREATE INDEX IF NOT EXISTS idx_positions_category ON positions(category);

CREATE TABLE IF NOT EXISTS organization_units (
  id TEXT PRIMARY KEY,
  parent_unit_id TEXT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL
    CHECK (unit_type IN ('company','division','department','region','area','branch','team','project_office','other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (parent_unit_id) REFERENCES organization_units(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_org_units_parent ON organization_units(parent_unit_id);
CREATE INDEX IF NOT EXISTS idx_org_units_type ON organization_units(unit_type);

CREATE TABLE IF NOT EXISTS employee_positions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  position_id TEXT NOT NULL,
  organization_unit_id TEXT,
  is_primary INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0,1)),
  appointment_type TEXT NOT NULL DEFAULT 'substantive'
    CHECK (appointment_type IN ('substantive','acting','temporary','additional')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planned','active','ended','suspended')),
  appointed_by_account_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (position_id) REFERENCES positions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (organization_unit_id) REFERENCES organization_units(id) ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (appointed_by_account_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_primary_position_active
  ON employee_positions(employee_id)
  WHERE is_primary = 1 AND status = 'active' AND end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_positions_employee ON employee_positions(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_positions_unit ON employee_positions(organization_unit_id, status);

CREATE TABLE IF NOT EXISTS organization_unit_memberships (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  organization_unit_id TEXT NOT NULL,
  position_id TEXT,
  membership_type TEXT NOT NULL DEFAULT 'primary'
    CHECK (membership_type IN ('primary','secondary','temporary','acting')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planned','active','ended','suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (organization_unit_id) REFERENCES organization_units(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (position_id) REFERENCES positions(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_primary_membership_active
  ON organization_unit_memberships(employee_id)
  WHERE membership_type = 'primary' AND status = 'active' AND end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_unit_memberships_unit ON organization_unit_memberships(organization_unit_id, status);
CREATE INDEX IF NOT EXISTS idx_unit_memberships_employee ON organization_unit_memberships(employee_id, status);

CREATE TABLE IF NOT EXISTS employee_reporting_lines (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  reports_to_employee_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'line_manager'
    CHECK (relationship_type IN ('line_manager','functional_manager','team_lead','mentor','acting_manager')),
  scope_type TEXT NOT NULL DEFAULT 'organization_unit'
    CHECK (scope_type IN ('global','organization_unit','area','department','temporary')),
  scope_id TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planned','active','ended','suspended')),
  override_reason TEXT,
  approved_by_account_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (reports_to_employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (approved_by_account_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CHECK (employee_id <> reports_to_employee_id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reporting_primary_active
  ON employee_reporting_lines(employee_id, scope_type, ifnull(scope_id, ''))
  WHERE is_primary = 1 AND status = 'active' AND end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_reporting_manager ON employee_reporting_lines(reports_to_employee_id, status);
CREATE INDEX IF NOT EXISTS idx_reporting_employee ON employee_reporting_lines(employee_id, status);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account_roles (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'self'
    CHECK (scope_type IN ('global','organization_unit','area','team','self')),
  scope_id TEXT,
  start_at TEXT,
  end_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','ended','suspended')),
  granted_by_account_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (granted_by_account_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_role_scope_active
  ON account_roles(account_id, role_id, scope_type, ifnull(scope_id, ''))
  WHERE status = 'active' AND end_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_account_roles_account ON account_roles(account_id, status);
CREATE INDEX IF NOT EXISTS idx_account_roles_scope ON account_roles(scope_type, scope_id, status);

CREATE TABLE IF NOT EXISTS identity_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_account_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (actor_account_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_identity_audit_entity ON identity_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_audit_actor ON identity_audit_logs(actor_account_id, created_at DESC);

-- Baseline roles. Permissions are deliberately explicit and can be extended later.
INSERT OR IGNORE INTO roles (id, code, name, description) VALUES
  ('ROLE_SUPER_ADMIN','super_admin','Super Admin','Full system administration'),
  ('ROLE_MANAGER','manager','Manager','Management access within assigned scope'),
  ('ROLE_SUPERVISOR','supervisor','Supervisor','Supervises teams within assigned scope'),
  ('ROLE_TEAM_LEADER','team_leader','Team Leader','Operational team leadership within assigned scope'),
  ('ROLE_EMPLOYEE','employee','Employee','Self-service operational access'),
  ('ROLE_VIEWER','viewer','Viewer','Read-only access within assigned scope');

INSERT OR IGNORE INTO permissions (id, code, module, action, description) VALUES
  ('PERM_EMPLOYEE_READ_SELF','employee.read_self','employee','read_self','Read own employee profile'),
  ('PERM_EMPLOYEE_READ_TEAM','employee.read_team','employee','read_team','Read direct and indirect reports in scope'),
  ('PERM_EMPLOYEE_MANAGE','employee.manage','employee','manage','Create and update employees in scope'),
  ('PERM_ORG_READ','organization.read','organization','read','Read organization hierarchy'),
  ('PERM_ORG_MANAGE','organization.manage','organization','manage','Manage positions, units, memberships, and reporting lines'),
  ('PERM_ACCOUNT_MANAGE','account.manage','account','manage','Manage accounts and role assignments'),
  ('PERM_ATTENDANCE_SELF','attendance.check_in','attendance','check_in','Submit own attendance'),
  ('PERM_ATTENDANCE_REVIEW','attendance.review','attendance','review','Review team attendance'),
  ('PERM_TASK_READ_SELF','task.read_self','task','read_self','Read own tasks'),
  ('PERM_TASK_ASSIGN','task.assign','task','assign','Assign tasks within scope'),
  ('PERM_PROJECT_READ','project.read','project','read','Read projects within scope'),
  ('PERM_PROJECT_MANAGE','project.manage','project','manage','Manage projects within scope');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'ROLE_SUPER_ADMIN', id FROM permissions;

INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
  ('ROLE_MANAGER','PERM_EMPLOYEE_READ_SELF'),
  ('ROLE_MANAGER','PERM_EMPLOYEE_READ_TEAM'),
  ('ROLE_MANAGER','PERM_EMPLOYEE_MANAGE'),
  ('ROLE_MANAGER','PERM_ORG_READ'),
  ('ROLE_MANAGER','PERM_ORG_MANAGE'),
  ('ROLE_MANAGER','PERM_ATTENDANCE_REVIEW'),
  ('ROLE_MANAGER','PERM_TASK_ASSIGN'),
  ('ROLE_MANAGER','PERM_PROJECT_READ'),
  ('ROLE_MANAGER','PERM_PROJECT_MANAGE'),
  ('ROLE_SUPERVISOR','PERM_EMPLOYEE_READ_SELF'),
  ('ROLE_SUPERVISOR','PERM_EMPLOYEE_READ_TEAM'),
  ('ROLE_SUPERVISOR','PERM_ORG_READ'),
  ('ROLE_SUPERVISOR','PERM_ATTENDANCE_REVIEW'),
  ('ROLE_SUPERVISOR','PERM_TASK_ASSIGN'),
  ('ROLE_SUPERVISOR','PERM_PROJECT_READ'),
  ('ROLE_TEAM_LEADER','PERM_EMPLOYEE_READ_SELF'),
  ('ROLE_TEAM_LEADER','PERM_EMPLOYEE_READ_TEAM'),
  ('ROLE_TEAM_LEADER','PERM_ORG_READ'),
  ('ROLE_TEAM_LEADER','PERM_ATTENDANCE_REVIEW'),
  ('ROLE_TEAM_LEADER','PERM_TASK_ASSIGN'),
  ('ROLE_TEAM_LEADER','PERM_PROJECT_READ'),
  ('ROLE_EMPLOYEE','PERM_EMPLOYEE_READ_SELF'),
  ('ROLE_EMPLOYEE','PERM_ATTENDANCE_SELF'),
  ('ROLE_EMPLOYEE','PERM_TASK_READ_SELF'),
  ('ROLE_EMPLOYEE','PERM_PROJECT_READ'),
  ('ROLE_VIEWER','PERM_ORG_READ'),
  ('ROLE_VIEWER','PERM_PROJECT_READ');
