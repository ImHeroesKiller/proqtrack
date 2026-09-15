-- Milestone 5 — Production Hardening & Observability
-- Adds distributed rate limiting, minute-level request metrics, and maintenance audit state.

CREATE TABLE IF NOT EXISTS core_rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  limit_value INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_core_rate_limit_expiry
  ON core_rate_limit_buckets(expires_at);
CREATE INDEX IF NOT EXISTS idx_core_rate_limit_scope_window
  ON core_rate_limit_buckets(scope, window_start);

CREATE TABLE IF NOT EXISTS core_observability_minute (
  bucket_minute TEXT NOT NULL,
  route_group TEXT NOT NULL,
  method TEXT NOT NULL,
  status_class TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  latency_sum_ms INTEGER NOT NULL DEFAULT 0,
  latency_max_ms INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(bucket_minute, route_group, method, status_class)
);

CREATE INDEX IF NOT EXISTS idx_core_observability_minute_time
  ON core_observability_minute(bucket_minute);

CREATE TABLE IF NOT EXISTS core_maintenance_runs (
  id TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','success','failed')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_core_maintenance_runs_task
  ON core_maintenance_runs(task, started_at DESC);
