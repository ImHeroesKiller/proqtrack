-- Milestone 6 — Reporting, Workflow Automation & Scale
-- Additive evolution of the existing report_generation_jobs table plus
-- normalized scheduling/workflow/notification structures.

ALTER TABLE report_generation_jobs ADD COLUMN organization_id TEXT;
ALTER TABLE report_generation_jobs ADD COLUMN report_name TEXT;
ALTER TABLE report_generation_jobs ADD COLUMN filters_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE report_generation_jobs ADD COLUMN priority INTEGER NOT NULL DEFAULT 5;
ALTER TABLE report_generation_jobs ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE report_generation_jobs ADD COLUMN available_at TEXT;
ALTER TABLE report_generation_jobs ADD COLUMN claimed_at TEXT;
ALTER TABLE report_generation_jobs ADD COLUMN lease_expires_at TEXT;
ALTER TABLE report_generation_jobs ADD COLUMN worker_id TEXT;
ALTER TABLE report_generation_jobs ADD COLUMN result_content_type TEXT;
ALTER TABLE report_generation_jobs ADD COLUMN result_size_bytes INTEGER;
ALTER TABLE report_generation_jobs ADD COLUMN result_sha256 TEXT;
ALTER TABLE report_generation_jobs ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE report_generation_jobs ADD COLUMN approval_request_id TEXT;
ALTER TABLE report_generation_jobs ADD COLUMN schedule_id TEXT;
ALTER TABLE report_generation_jobs ADD COLUMN expires_at TEXT;

UPDATE report_generation_jobs
SET organization_id='ORG-DEFAULT'
WHERE organization_id IS NULL;

UPDATE report_generation_jobs
SET available_at=COALESCE(available_at, created_at)
WHERE available_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_report_jobs_dispatch
  ON report_generation_jobs(status, available_at, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_report_jobs_org
  ON report_generation_jobs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_jobs_publication
  ON report_generation_jobs(organization_id, publication_status, completed_at DESC);

CREATE TABLE IF NOT EXISTS core_report_schedules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('csv','json')),
  project_id TEXT,
  cadence TEXT NOT NULL CHECK(cadence IN ('daily','weekly','monthly')),
  run_hour INTEGER NOT NULL DEFAULT 7 CHECK(run_hour BETWEEN 0 AND 23),
  run_day INTEGER,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  filters_json TEXT NOT NULL DEFAULT '{}',
  requires_approval INTEGER NOT NULL DEFAULT 0 CHECK(requires_approval IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_report_schedules_due
  ON core_report_schedules(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_core_report_schedules_org
  ON core_report_schedules(organization_id, status, next_run_at);

CREATE TABLE IF NOT EXISTS core_workflow_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  workflow_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  project_id TEXT,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','cancelled')),
  current_step INTEGER NOT NULL DEFAULT 1 CHECK(current_step >= 1),
  payload_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, organization_id)
    REFERENCES core_projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (requested_by, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_workflow_requests_scope
  ON core_workflow_requests(organization_id, project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_core_workflow_requests_requester
  ON core_workflow_requests(organization_id, requested_by, created_at DESC);

CREATE TABLE IF NOT EXISTS core_workflow_steps (
  organization_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  step_no INTEGER NOT NULL CHECK(step_no >= 1),
  approver_role TEXT NOT NULL,
  approver_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','skipped')),
  acted_by TEXT,
  acted_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, request_id, step_no),
  FOREIGN KEY (request_id, organization_id)
    REFERENCES core_workflow_requests(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (approver_user_id, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (acted_by, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_workflow_steps_pending
  ON core_workflow_steps(organization_id, status, approver_role, step_no);

CREATE TABLE IF NOT EXISTS core_workflow_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id, organization_id)
    REFERENCES core_workflow_requests(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_core_workflow_events_request
  ON core_workflow_events(organization_id, request_id, created_at);

CREATE TABLE IF NOT EXISTS core_notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  target_role TEXT,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, organization_id)
    REFERENCES core_organization_users(user_id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_core_notifications_user
  ON core_notifications(organization_id, user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_core_notifications_role
  ON core_notifications(organization_id, target_role, status, created_at DESC);

-- Analytics/report query indexes for larger operational datasets.
CREATE INDEX IF NOT EXISTS idx_core_visits_analytics
  ON core_visits(organization_id, project_id, status, completed_at);
CREATE INDEX IF NOT EXISTS idx_core_attendance_analytics
  ON core_attendance(organization_id, project_id, status, work_date);
CREATE INDEX IF NOT EXISTS idx_core_sales_analytics
  ON core_product_sales(organization_id, project_id, sold_at, employee_id);
CREATE INDEX IF NOT EXISTS idx_core_surveys_analytics
  ON core_survey_responses(organization_id, project_id, status, submitted_at);
