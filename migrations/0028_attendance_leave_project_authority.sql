-- P0 Attendance + Leave authority.
-- Project attendance source is stored in core_projects.metadata_json as attendanceSource ('manual'|'visit').
-- Leaves become project-scoped; legacy rows are backfilled from an active assignment when possible.

ALTER TABLE core_leaves ADD COLUMN project_id TEXT;

UPDATE core_leaves
SET project_id = (
  SELECT a.project_id
  FROM core_employee_project_assignments a
  WHERE a.organization_id = core_leaves.organization_id
    AND a.employee_id = core_leaves.employee_id
    AND a.status = 'active'
    AND (a.starts_on IS NULL OR date(a.starts_on) <= date(core_leaves.start_date))
    AND (a.ends_on IS NULL OR date(a.ends_on) >= date(core_leaves.start_date))
  ORDER BY a.starts_on DESC, a.id
  LIMIT 1
)
WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_core_leaves_project_scope
  ON core_leaves(organization_id, project_id, employee_id, status, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_core_attendance_source_scope
  ON core_attendance(organization_id, project_id, employee_id, work_date, status);

UPDATE core_projects
SET metadata_json = json_set(
  CASE WHEN json_valid(metadata_json) THEN metadata_json ELSE '{}' END,
  '$.attendanceSource',
  COALESCE(NULLIF(json_extract(metadata_json,'$.attendanceSource'),''),'manual')
)
WHERE COALESCE(json_extract(metadata_json,'$.attendanceSource'),'') NOT IN ('manual','visit');
