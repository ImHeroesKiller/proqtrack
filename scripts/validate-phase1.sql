PRAGMA foreign_keys;

SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN (
    'employees','accounts','positions','organization_units',
    'employee_positions','organization_unit_memberships',
    'employee_reporting_lines','roles','permissions',
    'role_permissions','account_roles','identity_audit_logs'
  )
ORDER BY name;

SELECT 'roles' AS entity, COUNT(*) AS row_count FROM roles
UNION ALL
SELECT 'permissions', COUNT(*) FROM permissions
UNION ALL
SELECT 'role_permissions', COUNT(*) FROM role_permissions;

SELECT r.code AS role_code, COUNT(rp.permission_id) AS permission_count
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
GROUP BY r.id, r.code
ORDER BY r.code;

PRAGMA foreign_key_check;
