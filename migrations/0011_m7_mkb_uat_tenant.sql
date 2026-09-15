-- Milestone 7 — Full Production UAT & Go-Live Readiness
-- Idempotent master-data seed for the isolated Mitra Kreasi Bersama (MKB) UAT tenant.
-- No plaintext credentials are created here. Existing global auth users are linked by email only when present.

INSERT OR IGNORE INTO core_organizations (
  id, code, name, status, timezone, created_at, updated_at
) VALUES (
  'ORG-MKB', 'MKB', 'Mitra Kreasi Bersama', 'active', 'Asia/Jakarta', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO core_clients (
  id, organization_id, code, name, status, metadata_json, created_at, updated_at
) VALUES (
  'CL-MKB-FMCG-UAT', 'ORG-MKB', 'FMCG-UAT', 'MKB FMCG Principal (UAT)', 'active',
  '{"synthetic":true,"purpose":"M7 production UAT"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO core_projects (
  id, organization_id, client_id, code, name, status, starts_on, ends_on, metadata_json, created_at, updated_at
) VALUES (
  'PRJ-MKB-SALES-UAT', 'ORG-MKB', 'CL-MKB-FMCG-UAT', 'MKB-SALES-UAT',
  'MKB FMCG Sales & Merchandising UAT', 'active', '2026-09-01', '2026-12-31',
  '{"synthetic":true,"industry":"FMCG","scope":["merchandising","spg","sales execution"]}',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO core_sync_state (
  organization_id, revision, cutover_mode, imported_at, updated_at
) VALUES (
  'ORG-MKB', 1, 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Synthetic outlets for mobile/geofence/visit UAT.
INSERT OR IGNORE INTO core_outlets
(id, organization_id, client_id, code, name, address, latitude, longitude, geofence_radius_m, status, metadata_json, created_at, updated_at)
VALUES
('OUT-MKB-001','ORG-MKB','CL-MKB-FMCG-UAT','MKB-001','MKB UAT Outlet Sudirman','Sudirman, Jakarta',-6.214620,106.822900,100,'active','{"synthetic":true,"cluster":"Central Jakarta"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('OUT-MKB-002','ORG-MKB','CL-MKB-FMCG-UAT','MKB-002','MKB UAT Outlet Kuningan','Kuningan, Jakarta',-6.229700,106.829500,100,'active','{"synthetic":true,"cluster":"South Jakarta"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('OUT-MKB-003','ORG-MKB','CL-MKB-FMCG-UAT','MKB-003','MKB UAT Outlet Tebet','Tebet, Jakarta',-6.235000,106.852000,100,'active','{"synthetic":true,"cluster":"South Jakarta"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('OUT-MKB-004','ORG-MKB','CL-MKB-FMCG-UAT','MKB-004','MKB UAT Outlet Kemang','Kemang, Jakarta',-6.260700,106.813000,100,'active','{"synthetic":true,"cluster":"South Jakarta"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('OUT-MKB-005','ORG-MKB','CL-MKB-FMCG-UAT','MKB-005','MKB UAT Outlet Bintaro','Bintaro, Tangerang Selatan',-6.270000,106.740000,100,'active','{"synthetic":true,"cluster":"Tangerang Selatan"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('OUT-MKB-006','ORG-MKB','CL-MKB-FMCG-UAT','MKB-006','MKB UAT Outlet Alam Sutera','Alam Sutera, Tangerang',-6.245000,106.651000,100,'active','{"synthetic":true,"cluster":"Tangerang"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO core_project_outlets (organization_id, project_id, outlet_id, status, created_at)
SELECT 'ORG-MKB', 'PRJ-MKB-SALES-UAT', id, 'active', CURRENT_TIMESTAMP
FROM core_outlets
WHERE organization_id='ORG-MKB';

-- Synthetic FMCG catalog for sales-entry and analytics UAT.
INSERT OR IGNORE INTO core_products
(id, organization_id, client_id, sku, name, unit, status, metadata_json, created_at, updated_at)
VALUES
('PROD-MKB-001','ORG-MKB','CL-MKB-FMCG-UAT','MKB-BEV-250','MKB Citrus Drink 250ml','pcs','active','{"synthetic":true,"category":"Beverage"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('PROD-MKB-002','ORG-MKB','CL-MKB-FMCG-UAT','MKB-BEV-500','MKB Citrus Drink 500ml','pcs','active','{"synthetic":true,"category":"Beverage"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('PROD-MKB-003','ORG-MKB','CL-MKB-FMCG-UAT','MKB-SNK-050','MKB Crunch Snack 50g','pcs','active','{"synthetic":true,"category":"Snack"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('PROD-MKB-004','ORG-MKB','CL-MKB-FMCG-UAT','MKB-SNK-100','MKB Crunch Snack 100g','pcs','active','{"synthetic":true,"category":"Snack"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('PROD-MKB-005','ORG-MKB','CL-MKB-FMCG-UAT','MKB-PCL-001','MKB Personal Care 100ml','pcs','active','{"synthetic":true,"category":"Personal Care"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO core_project_products (organization_id, project_id, product_id, status, created_at, updated_at)
SELECT 'ORG-MKB', 'PRJ-MKB-SALES-UAT', id, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM core_products
WHERE organization_id='ORG-MKB';

-- UAT personas. auth_user_id remains NULL until an existing login with the same email is linked below.
INSERT OR IGNORE INTO core_employees
(id, organization_id, auth_user_id, employee_code, full_name, email, phone, employment_status, metadata_json, created_at, updated_at)
VALUES
('EMP-MKB-BUDI','ORG-MKB',NULL,'MKB-MERCH-001','Budi Santoso','budi.santoso@proqtrack.id',NULL,'active','{"synthetic":true,"persona":"Merchandiser"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('EMP-MKB-NADIA','ORG-MKB',NULL,'MKB-SPG-001','Nadia Permata','nadia.permata@proqtrack.id',NULL,'active','{"synthetic":true,"persona":"SPG"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('EMP-MKB-RIZKY','ORG-MKB',NULL,'MKB-SPV-001','Rizky Pratama','rizky.pratama@proqtrack.id',NULL,'active','{"synthetic":true,"persona":"Supervisor Sales"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('EMP-MKB-MANAGER','ORG-MKB',NULL,'MKB-MGR-001','Manager MKB','manager-re@proqtrack.id',NULL,'active','{"synthetic":true,"persona":"Manager"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('EMP-MKB-HEAD','ORG-MKB',NULL,'MKB-HEAD-001','Head MKB','head@proqtrack.id',NULL,'active','{"synthetic":true,"persona":"Head"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

-- Link existing global auth users into MKB. This intentionally creates no passwords.
INSERT OR IGNORE INTO core_organization_users (organization_id, user_id, role, status, created_at, updated_at)
SELECT 'ORG-MKB', id,
  CASE email
    WHEN 'head@proqtrack.id' THEN 'head'
    WHEN 'manager-re@proqtrack.id' THEN 'manager'
    WHEN 'rizky.pratama@proqtrack.id' THEN 'supervisor'
    ELSE 'employee'
  END,
  'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM auth_users
WHERE email IN (
  'head@proqtrack.id',
  'manager-re@proqtrack.id',
  'rizky.pratama@proqtrack.id',
  'budi.santoso@proqtrack.id',
  'nadia.permata@proqtrack.id'
) AND status='active';

UPDATE core_employees
SET auth_user_id=(
  SELECT au.id FROM auth_users au
  JOIN core_organization_users ou ON ou.user_id=au.id AND ou.organization_id='ORG-MKB' AND ou.status='active'
  WHERE au.email=core_employees.email
  LIMIT 1
), updated_at=CURRENT_TIMESTAMP
WHERE organization_id='ORG-MKB'
  AND email IN ('head@proqtrack.id','manager-re@proqtrack.id','rizky.pratama@proqtrack.id','budi.santoso@proqtrack.id','nadia.permata@proqtrack.id')
  AND EXISTS (
    SELECT 1 FROM auth_users au
    JOIN core_organization_users ou ON ou.user_id=au.id AND ou.organization_id='ORG-MKB' AND ou.status='active'
    WHERE au.email=core_employees.email
  );

INSERT OR IGNORE INTO core_project_memberships (organization_id, project_id, user_id, role, status, created_at, updated_at)
SELECT 'ORG-MKB', 'PRJ-MKB-SALES-UAT', au.id,
  CASE au.email
    WHEN 'manager-re@proqtrack.id' THEN 'manager'
    WHEN 'rizky.pratama@proqtrack.id' THEN 'supervisor'
    ELSE 'employee'
  END,
  'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM auth_users au
JOIN core_organization_users ou ON ou.user_id=au.id AND ou.organization_id='ORG-MKB'
WHERE au.email IN ('manager-re@proqtrack.id','rizky.pratama@proqtrack.id','budi.santoso@proqtrack.id','nadia.permata@proqtrack.id')
  AND au.status='active' AND ou.status='active';

INSERT OR IGNORE INTO core_employee_project_assignments
(id, organization_id, project_id, employee_id, supervisor_user_id, position_name, status, starts_on, ends_on, metadata_json, created_at, updated_at)
VALUES
('EPA-MKB-BUDI','ORG-MKB','PRJ-MKB-SALES-UAT','EMP-MKB-BUDI',NULL,'Merchandiser','active','2026-09-01','2026-12-31','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('EPA-MKB-NADIA','ORG-MKB','PRJ-MKB-SALES-UAT','EMP-MKB-NADIA',NULL,'SPG','active','2026-09-01','2026-12-31','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('EPA-MKB-RIZKY','ORG-MKB','PRJ-MKB-SALES-UAT','EMP-MKB-RIZKY',NULL,'Supervisor Sales','active','2026-09-01','2026-12-31','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('EPA-MKB-MANAGER','ORG-MKB','PRJ-MKB-SALES-UAT','EMP-MKB-MANAGER',NULL,'Project Manager','active','2026-09-01','2026-12-31','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

UPDATE core_employee_project_assignments
SET supervisor_user_id=(SELECT id FROM auth_users WHERE email='rizky.pratama@proqtrack.id' AND status='active' LIMIT 1),
    updated_at=CURRENT_TIMESTAMP
WHERE organization_id='ORG-MKB'
  AND employee_id IN ('EMP-MKB-BUDI','EMP-MKB-NADIA')
  AND EXISTS (
    SELECT 1 FROM auth_users au
    JOIN core_organization_users ou ON ou.user_id=au.id AND ou.organization_id='ORG-MKB' AND ou.role='supervisor' AND ou.status='active'
    WHERE au.email='rizky.pratama@proqtrack.id'
  );

-- Perfect Store survey used by Merchandiser/SPG during visit UAT.
INSERT OR IGNORE INTO core_survey_templates
(id, organization_id, client_id, project_id, name, status, version, starts_at, ends_at, created_by, metadata_json, created_at, updated_at)
VALUES
('SURV-MKB-PERFECT-STORE','ORG-MKB','CL-MKB-FMCG-UAT','PRJ-MKB-SALES-UAT','MKB Perfect Store Audit','active',1,'2026-09-01T00:00:00Z','2026-12-31T23:59:59Z',NULL,'{"synthetic":true,"purpose":"M7 UAT"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO core_survey_questions
(id, organization_id, template_id, position, question_type, label, required, config_json, created_at)
VALUES
('Q-MKB-PS-01','ORG-MKB','SURV-MKB-PERFECT-STORE',1,'boolean','Produk tersedia di rak?',1,'{}',CURRENT_TIMESTAMP),
('Q-MKB-PS-02','ORG-MKB','SURV-MKB-PERFECT-STORE',2,'number','Jumlah facing utama',1,'{"min":0,"max":100}',CURRENT_TIMESTAMP),
('Q-MKB-PS-03','ORG-MKB','SURV-MKB-PERFECT-STORE',3,'select','Kondisi display',1,'{"options":["Baik","Perlu Perbaikan","Tidak Ada Display"]}',CURRENT_TIMESTAMP),
('Q-MKB-PS-04','ORG-MKB','SURV-MKB-PERFECT-STORE',4,'text','Catatan kompetitor',0,'{"maxLength":500}',CURRENT_TIMESTAMP);
