-- Make leave requests and outlet stock authoritative so local seed rows cannot
-- leak into an active organization after cloud bootstrap.

CREATE TABLE IF NOT EXISTS core_leaves (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days INTEGER NOT NULL CHECK(days > 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approver_id TEXT,
  submitted_at TEXT NOT NULL,
  approved_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id, organization_id) REFERENCES core_employees(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_core_leaves_scope
  ON core_leaves(organization_id, employee_id, status, start_date);

CREATE TABLE IF NOT EXISTS core_stocks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  min_stock INTEGER NOT NULL DEFAULT 0 CHECK(min_stock >= 0),
  updated_by TEXT,
  last_updated TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, organization_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, organization_id) REFERENCES core_projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id, organization_id) REFERENCES core_outlets(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, organization_id) REFERENCES core_products(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_core_stocks_scope
  ON core_stocks(organization_id, project_id, outlet_id, product_id);

INSERT OR IGNORE INTO core_leaves(
  id,organization_id,employee_id,type,start_date,end_date,days,reason,status,approver_id,submitted_at,approved_at
) VALUES
 ('LV-DEMO-001','ORG-DEFAULT','EMP-DEMO-001','Cuti Tahunan',date('now','+7 day'),date('now','+8 day'),2,'Acara keluarga','pending',NULL,date('now'),NULL),
 ('LV-DEMO-002','ORG-DEFAULT','EMP-DEMO-002','Sakit',date('now','-7 day'),date('now','-7 day'),1,'Istirahat dengan surat dokter','approved','USR-SUPERADMIN-UAT',date('now','-8 day'),date('now','-8 day')),
 ('LV-DEMO-003','ORG-DEFAULT','EMP-DEMO-003','Ijin Pribadi',date('now','-14 day'),date('now','-14 day'),1,'Keperluan administrasi keluarga','rejected','USR-SUPERADMIN-UAT',date('now','-16 day'),date('now','-15 day'));

INSERT OR IGNORE INTO core_stocks(
  id,organization_id,project_id,outlet_id,product_id,quantity,min_stock,updated_by,last_updated
) VALUES
 ('STK-DEMO-001','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-001','PROD-DEMO-001',8,12,'EMP-DEMO-001',date('now')),
 ('STK-DEMO-002','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-002','PROD-DEMO-002',6,10,'EMP-DEMO-002',date('now')),
 ('STK-DEMO-003','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-003','PROD-DEMO-003',24,10,'EMP-DEMO-003',date('now')),
 ('STK-DEMO-004','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-004','PROD-DEMO-004',18,8,'EMP-DEMO-004',date('now')),
 ('STK-DEMO-005','ORG-DEFAULT','PRJ-DEMO-AUDIT','OUT-DEMO-005','PROD-DEMO-005',30,12,'EMP-DEMO-005',date('now')),
 ('STK-DEMO-006','ORG-DEFAULT','PRJ-DEMO-AUDIT','OUT-DEMO-006','PROD-DEMO-006',15,8,'EMP-DEMO-006',date('now'));

UPDATE core_sync_state
SET revision=revision+1,last_mutation_id='demo-leaves-stocks-v1',updated_at=CURRENT_TIMESTAMP
WHERE organization_id='ORG-DEFAULT';
