CREATE TABLE IF NOT EXISTS security_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  actor_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  project_id TEXT,
  client_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'success',
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_audit_created_at ON security_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_actor ON security_audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_project ON security_audit_logs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_outcome ON security_audit_logs(outcome, created_at DESC);

CREATE TABLE IF NOT EXISTS report_generation_jobs (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL,
  format TEXT NOT NULL,
  project_id TEXT,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed','cancelled')),
  payload TEXT NOT NULL DEFAULT '{}',
  result_key TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_jobs_status ON report_generation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_report_jobs_project ON report_generation_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_jobs_requester ON report_generation_jobs(requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_jobs_failures ON report_generation_jobs(status, updated_at DESC);
