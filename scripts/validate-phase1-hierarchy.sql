PRAGMA foreign_keys = ON;

SELECT COUNT(*) AS active_reporting_lines
FROM employee_reporting_lines
WHERE status = 'active' AND end_date IS NULL;

SELECT COUNT(*) AS dangling_reporting_employee
FROM employee_reporting_lines erl
LEFT JOIN employees e ON e.id = erl.employee_id
WHERE e.id IS NULL;

SELECT COUNT(*) AS dangling_reporting_manager
FROM employee_reporting_lines erl
LEFT JOIN employees m ON m.id = erl.reports_to_employee_id
WHERE m.id IS NULL;

SELECT COUNT(*) AS self_reporting
FROM employee_reporting_lines
WHERE employee_id = reports_to_employee_id;

WITH RECURSIVE reporting_path(root_id, employee_id, manager_id, path, cycle, depth) AS (
  SELECT employee_id, employee_id, reports_to_employee_id,
         '|' || employee_id || '|', 0, 1
  FROM employee_reporting_lines
  WHERE status = 'active' AND end_date IS NULL
  UNION ALL
  SELECT rp.root_id, erl.employee_id, erl.reports_to_employee_id,
         rp.path || erl.employee_id || '|',
         instr(rp.path, '|' || erl.employee_id || '|') > 0,
         rp.depth + 1
  FROM reporting_path rp
  JOIN employee_reporting_lines erl ON erl.employee_id = rp.manager_id
  WHERE erl.status = 'active' AND erl.end_date IS NULL
    AND rp.cycle = 0 AND rp.depth < 50
)
SELECT COUNT(*) AS circular_reporting_paths
FROM reporting_path
WHERE cycle = 1;

SELECT COUNT(*) AS manager_accounts_without_employee
FROM accounts a
JOIN account_roles ar ON ar.account_id = a.id AND ar.status = 'active' AND ar.end_at IS NULL
JOIN roles r ON r.id = ar.role_id
WHERE r.code IN ('manager','supervisor','team_leader')
  AND a.employee_id IS NULL;

SELECT e.id, e.full_name, p.name AS position, ou.name AS unit,
       manager.full_name AS reports_to
FROM employees e
LEFT JOIN employee_positions ep ON ep.employee_id = e.id AND ep.is_primary = 1 AND ep.status = 'active' AND ep.end_date IS NULL
LEFT JOIN positions p ON p.id = ep.position_id
LEFT JOIN organization_unit_memberships oum ON oum.employee_id = e.id AND oum.membership_type = 'primary' AND oum.status = 'active' AND oum.end_date IS NULL
LEFT JOIN organization_units ou ON ou.id = oum.organization_unit_id
LEFT JOIN employee_reporting_lines erl ON erl.employee_id = e.id AND erl.is_primary = 1 AND erl.status = 'active' AND erl.end_date IS NULL
LEFT JOIN employees manager ON manager.id = erl.reports_to_employee_id
ORDER BY p.level_rank DESC, ou.name, e.full_name
LIMIT 50;

SELECT * FROM pragma_foreign_key_check;
