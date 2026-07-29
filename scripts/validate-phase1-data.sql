PRAGMA foreign_keys = ON;

SELECT 'employees' AS entity, COUNT(*) AS row_count FROM employees
UNION ALL SELECT 'accounts', COUNT(*) FROM accounts
UNION ALL SELECT 'positions', COUNT(*) FROM positions
UNION ALL SELECT 'employee_positions', COUNT(*) FROM employee_positions
UNION ALL SELECT 'organization_units', COUNT(*) FROM organization_units
UNION ALL SELECT 'organization_unit_memberships', COUNT(*) FROM organization_unit_memberships
UNION ALL SELECT 'employee_reporting_lines', COUNT(*) FROM employee_reporting_lines
UNION ALL SELECT 'account_roles', COUNT(*) FROM account_roles;

SELECT status, COUNT(*) AS account_count
FROM accounts
GROUP BY status
ORDER BY status;

SELECT
  e.id,
  e.employee_number,
  e.full_name,
  p.name AS primary_position,
  ou.name AS organization_unit,
  manager.full_name AS reports_to
FROM employees e
LEFT JOIN employee_positions ep
  ON ep.employee_id = e.id
 AND ep.is_primary = 1
 AND ep.status = 'active'
 AND ep.end_date IS NULL
LEFT JOIN positions p ON p.id = ep.position_id
LEFT JOIN organization_unit_memberships oum
  ON oum.employee_id = e.id
 AND oum.membership_type = 'primary'
 AND oum.status = 'active'
 AND oum.end_date IS NULL
LEFT JOIN organization_units ou ON ou.id = oum.organization_unit_id
LEFT JOIN employee_reporting_lines erl
  ON erl.employee_id = e.id
 AND erl.is_primary = 1
 AND erl.status = 'active'
 AND erl.end_date IS NULL
LEFT JOIN employees manager ON manager.id = erl.reports_to_employee_id
ORDER BY e.full_name;

SELECT * FROM pragma_foreign_key_check;
