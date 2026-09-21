-- Promote ORG-MKB from synthetic M7 UAT tenant to real production tenant.
-- Preserve all non-synthetic MKB records and the real Head account (akbar@mkb.com).
-- Remove only the known M7 seed graph and MKB memberships for the five synthetic personas.

-- Reporting/workflow rows that can retain the synthetic project.
DELETE FROM core_workflow_events
WHERE organization_id='ORG-MKB'
  AND request_id IN (
    SELECT id FROM core_workflow_requests
    WHERE organization_id='ORG-MKB' AND project_id='PRJ-MKB-SALES-UAT'
  );

DELETE FROM core_workflow_steps
WHERE organization_id='ORG-MKB'
  AND request_id IN (
    SELECT id FROM core_workflow_requests
    WHERE organization_id='ORG-MKB' AND project_id='PRJ-MKB-SALES-UAT'
  );

DELETE FROM core_workflow_requests
WHERE organization_id='ORG-MKB' AND project_id='PRJ-MKB-SALES-UAT';

DELETE FROM core_report_schedules
WHERE organization_id='ORG-MKB' AND project_id='PRJ-MKB-SALES-UAT';

DELETE FROM report_generation_jobs
WHERE organization_id='ORG-MKB' AND project_id='PRJ-MKB-SALES-UAT';

-- Operational rows tied to the synthetic MKB project/personas.
DELETE FROM core_survey_responses
WHERE organization_id='ORG-MKB'
  AND (
    project_id='PRJ-MKB-SALES-UAT'
    OR employee_id IN ('EMP-MKB-BUDI','EMP-MKB-NADIA','EMP-MKB-RIZKY','EMP-MKB-MANAGER','EMP-MKB-HEAD')
  );

DELETE FROM core_field_evidence
WHERE organization_id='ORG-MKB'
  AND (
    project_id='PRJ-MKB-SALES-UAT'
    OR employee_id IN ('EMP-MKB-BUDI','EMP-MKB-NADIA','EMP-MKB-RIZKY','EMP-MKB-MANAGER','EMP-MKB-HEAD')
  );

DELETE FROM core_product_sales
WHERE organization_id='ORG-MKB'
  AND (
    project_id='PRJ-MKB-SALES-UAT'
    OR employee_id IN ('EMP-MKB-BUDI','EMP-MKB-NADIA','EMP-MKB-RIZKY','EMP-MKB-MANAGER','EMP-MKB-HEAD')
    OR product_id IN ('PROD-MKB-001','PROD-MKB-002','PROD-MKB-003','PROD-MKB-004','PROD-MKB-005')
  );

DELETE FROM core_attendance
WHERE organization_id='ORG-MKB'
  AND (
    project_id='PRJ-MKB-SALES-UAT'
    OR employee_id IN ('EMP-MKB-BUDI','EMP-MKB-NADIA','EMP-MKB-RIZKY','EMP-MKB-MANAGER','EMP-MKB-HEAD')
  );

DELETE FROM core_visits
WHERE organization_id='ORG-MKB'
  AND (
    project_id='PRJ-MKB-SALES-UAT'
    OR employee_id IN ('EMP-MKB-BUDI','EMP-MKB-NADIA','EMP-MKB-RIZKY','EMP-MKB-MANAGER','EMP-MKB-HEAD')
    OR outlet_id IN ('OUT-MKB-001','OUT-MKB-002','OUT-MKB-003','OUT-MKB-004','OUT-MKB-005','OUT-MKB-006')
  );

DELETE FROM core_project_products
WHERE organization_id='ORG-MKB'
  AND (
    project_id='PRJ-MKB-SALES-UAT'
    OR product_id IN ('PROD-MKB-001','PROD-MKB-002','PROD-MKB-003','PROD-MKB-004','PROD-MKB-005')
  );

DELETE FROM core_project_outlets
WHERE organization_id='ORG-MKB'
  AND (
    project_id='PRJ-MKB-SALES-UAT'
    OR outlet_id IN ('OUT-MKB-001','OUT-MKB-002','OUT-MKB-003','OUT-MKB-004','OUT-MKB-005','OUT-MKB-006')
  );

DELETE FROM core_employee_project_assignments
WHERE organization_id='ORG-MKB'
  AND (
    project_id='PRJ-MKB-SALES-UAT'
    OR employee_id IN ('EMP-MKB-BUDI','EMP-MKB-NADIA','EMP-MKB-RIZKY','EMP-MKB-MANAGER','EMP-MKB-HEAD')
  );

DELETE FROM core_project_memberships
WHERE organization_id='ORG-MKB'
  AND (
    project_id='PRJ-MKB-SALES-UAT'
    OR user_id IN (
      SELECT id FROM auth_users
      WHERE lower(email) IN (
        'budi.santoso@proqtrack.id',
        'nadia.permata@proqtrack.id',
        'rizky.pratama@proqtrack.id',
        'manager-re@proqtrack.id',
        'head@proqtrack.id'
      )
    )
  );

DELETE FROM core_survey_questions
WHERE organization_id='ORG-MKB'
  AND template_id='SURV-MKB-PERFECT-STORE';

DELETE FROM core_survey_templates
WHERE organization_id='ORG-MKB'
  AND (
    id='SURV-MKB-PERFECT-STORE'
    OR project_id='PRJ-MKB-SALES-UAT'
  );

DELETE FROM core_products
WHERE organization_id='ORG-MKB'
  AND id IN ('PROD-MKB-001','PROD-MKB-002','PROD-MKB-003','PROD-MKB-004','PROD-MKB-005');

DELETE FROM core_outlets
WHERE organization_id='ORG-MKB'
  AND id IN ('OUT-MKB-001','OUT-MKB-002','OUT-MKB-003','OUT-MKB-004','OUT-MKB-005','OUT-MKB-006');

DELETE FROM core_employees
WHERE organization_id='ORG-MKB'
  AND id IN ('EMP-MKB-BUDI','EMP-MKB-NADIA','EMP-MKB-RIZKY','EMP-MKB-MANAGER','EMP-MKB-HEAD');

DELETE FROM core_projects
WHERE organization_id='ORG-MKB'
  AND id='PRJ-MKB-SALES-UAT';

DELETE FROM core_clients
WHERE organization_id='ORG-MKB'
  AND id='CL-MKB-FMCG-UAT';

-- Remove tenant-local session/device/audit state for the synthetic personas only.
DELETE FROM core_auth_devices
WHERE organization_id='ORG-MKB'
  AND user_id IN (
    SELECT id FROM auth_users
    WHERE lower(email) IN (
      'budi.santoso@proqtrack.id',
      'nadia.permata@proqtrack.id',
      'rizky.pratama@proqtrack.id',
      'manager-re@proqtrack.id',
      'head@proqtrack.id'
    )
  );

DELETE FROM core_auth_sessions
WHERE organization_id='ORG-MKB'
  AND user_id IN (
    SELECT id FROM auth_users
    WHERE lower(email) IN (
      'budi.santoso@proqtrack.id',
      'nadia.permata@proqtrack.id',
      'rizky.pratama@proqtrack.id',
      'manager-re@proqtrack.id',
      'head@proqtrack.id'
    )
  );

DELETE FROM core_sync_conflicts
WHERE organization_id='ORG-MKB'
  AND actor_user_id IN (
    SELECT id FROM auth_users
    WHERE lower(email) IN (
      'budi.santoso@proqtrack.id',
      'nadia.permata@proqtrack.id',
      'rizky.pratama@proqtrack.id',
      'manager-re@proqtrack.id',
      'head@proqtrack.id'
    )
  );

DELETE FROM core_operational_audit_logs
WHERE organization_id='ORG-MKB'
  AND actor_user_id IN (
    SELECT id FROM auth_users
    WHERE lower(email) IN (
      'budi.santoso@proqtrack.id',
      'nadia.permata@proqtrack.id',
      'rizky.pratama@proqtrack.id',
      'manager-re@proqtrack.id',
      'head@proqtrack.id'
    )
  );

DELETE FROM core_api_idempotency_keys
WHERE organization_id='ORG-MKB'
  AND actor_user_id IN (
    SELECT id FROM auth_users
    WHERE lower(email) IN (
      'budi.santoso@proqtrack.id',
      'nadia.permata@proqtrack.id',
      'rizky.pratama@proqtrack.id',
      'manager-re@proqtrack.id',
      'head@proqtrack.id'
    )
  );

DELETE FROM core_legacy_import_batches
WHERE organization_id='ORG-MKB'
  AND created_by IN (
    SELECT id FROM auth_users
    WHERE lower(email) IN (
      'budi.santoso@proqtrack.id',
      'nadia.permata@proqtrack.id',
      'rizky.pratama@proqtrack.id',
      'manager-re@proqtrack.id',
      'head@proqtrack.id'
    )
  );

DELETE FROM core_organization_users
WHERE organization_id='ORG-MKB'
  AND user_id IN (
    SELECT id FROM auth_users
    WHERE lower(email) IN (
      'budi.santoso@proqtrack.id',
      'nadia.permata@proqtrack.id',
      'rizky.pratama@proqtrack.id',
      'manager-re@proqtrack.id',
      'head@proqtrack.id'
    )
  );

-- Any fixed Rizky provisioning identity created solely for MKB can safely remain
-- globally; without ORG-MKB membership it cannot appear in tenant account lists.

UPDATE core_sync_state
SET revision=revision+1,
    last_mutation_id='mkb-real-tenant-promotion-0016',
    updated_at=CURRENT_TIMESTAMP
WHERE organization_id='ORG-MKB';

UPDATE core_organizations
SET updated_at=CURRENT_TIMESTAMP
WHERE id='ORG-MKB';
