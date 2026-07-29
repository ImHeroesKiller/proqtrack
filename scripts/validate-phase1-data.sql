PRAGMA foreign_keys = ON;

SELECT 'employees' AS entity, COUNT(*) AS row_count FROM employees;
SELECT 'accounts' AS entity, COUNT(*) AS row_count FROM accounts;
SELECT 'positions' AS entity, COUNT(*) AS row_count FROM positions;
SELECT 'employee_positions' AS entity, COUNT(*) AS row_count FROM employee_positions;
SELECT 'organization_units' AS entity, COUNT(*) AS row_count FROM organization_units;
SELECT 'organization_unit_memberships' AS entity, COUNT(*) AS row_count FROM organization_unit_memberships;
SELECT 'employee_reporting_lines' AS entity, COUNT(*) AS row_count FROM employee_reporting_lines;
SELECT 'account_roles' AS entity, COUNT(*) AS row_count FROM account_roles;

SELECT status, COUNT(*) AS account_count
FROM accounts
GROUP BY status
ORDER BY status;

SELECT COUNT(*) AS employees_without_primary_position
FROM employees e
WHERE NOT EXISTS (
  SELECT 1 FROM employee_positions ep
  WHERE ep.employee_id = e.id
    AND ep.is_primary = 1
    AND ep.status = 'active'
    AND ep.end_date IS NULL
);

SELECT COUNT(*) AS employees_without_primary_unit
FROM employees e
WHERE NOT EXISTS (
  SELECT 1 FROM organization_unit_memberships oum
  WHERE oum.employee_id = e.id
    AND oum.membership_type = 'primary'
    AND oum.status = 'active'
    AND oum.end_date IS NULL
);

SELECT COUNT(*) AS accounts_without_role
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM account_roles ar
  WHERE ar.account_id = a.id
    AND ar.status = 'active'
    AND ar.end_at IS NULL
);

SELECT COUNT(*) AS foreign_key_violations
FROM pragma_foreign_key_check;

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
ORDER BY e.full_name
LIMIT 20;
