-- Production-safe sample dataset for the dedicated Demo organization.
-- IDs are namespaced and every insert is idempotent.

INSERT OR IGNORE INTO core_clients(id,organization_id,code,name,status,metadata_json)
VALUES
 ('CL-DEMO-FMCG','ORG-DEFAULT','FMCG-DEMO','Nusantara Consumer Goods','active','{"industry":"FMCG","city":"Jakarta"}'),
 ('CL-DEMO-RETAIL','ORG-DEFAULT','RTL-DEMO','Ritel Sejahtera Indonesia','active','{"industry":"Retail","city":"Tangerang"}');

INSERT OR IGNORE INTO core_projects(id,organization_id,client_id,code,name,status,starts_on,ends_on,metadata_json)
VALUES
 ('PRJ-DEMO-SALES','ORG-DEFAULT','CL-DEMO-FMCG','SALES-DEMO','Sales & Merchandising Jabodetabek','active',date('now','-60 day'),date('now','+305 day'),'{"area":"Jabodetabek","targetVisits":120}'),
 ('PRJ-DEMO-AUDIT','ORG-DEFAULT','CL-DEMO-RETAIL','AUDIT-DEMO','Retail Visibility Audit','active',date('now','-30 day'),date('now','+150 day'),'{"area":"Tangerang","targetVisits":80}');

INSERT OR IGNORE INTO core_employees(id,organization_id,employee_code,full_name,email,phone,employment_status,metadata_json)
VALUES
 ('EMP-DEMO-001','ORG-DEFAULT','DMO001','Andi Pratama','andi.demo@proqtrack.id','081200000001','active','{"position":"Merchandiser","area":"Jakarta Selatan"}'),
 ('EMP-DEMO-002','ORG-DEFAULT','DMO002','Siti Rahma','siti.demo@proqtrack.id','081200000002','active','{"position":"SPG","area":"Jakarta Barat"}'),
 ('EMP-DEMO-003','ORG-DEFAULT','DMO003','Raka Saputra','raka.demo@proqtrack.id','081200000003','active','{"position":"Merchandiser","area":"Tangerang"}'),
 ('EMP-DEMO-004','ORG-DEFAULT','DMO004','Dewi Lestari','dewi.demo@proqtrack.id','081200000004','active','{"position":"SPG","area":"Bekasi"}'),
 ('EMP-DEMO-005','ORG-DEFAULT','DMO005','Fajar Nugraha','fajar.demo@proqtrack.id','081200000005','active','{"position":"Auditor","area":"Tangerang"}'),
 ('EMP-DEMO-006','ORG-DEFAULT','DMO006','Maya Putri','maya.demo@proqtrack.id','081200000006','active','{"position":"Auditor","area":"Jakarta"}');

INSERT OR IGNORE INTO core_employee_project_assignments(id,organization_id,project_id,employee_id,position_name,status,starts_on,metadata_json)
VALUES
 ('ASN-DEMO-001','ORG-DEFAULT','PRJ-DEMO-SALES','EMP-DEMO-001','Merchandiser','active',date('now','-60 day'),'{}'),
 ('ASN-DEMO-002','ORG-DEFAULT','PRJ-DEMO-SALES','EMP-DEMO-002','SPG','active',date('now','-60 day'),'{}'),
 ('ASN-DEMO-003','ORG-DEFAULT','PRJ-DEMO-SALES','EMP-DEMO-003','Merchandiser','active',date('now','-45 day'),'{}'),
 ('ASN-DEMO-004','ORG-DEFAULT','PRJ-DEMO-SALES','EMP-DEMO-004','SPG','active',date('now','-45 day'),'{}'),
 ('ASN-DEMO-005','ORG-DEFAULT','PRJ-DEMO-AUDIT','EMP-DEMO-005','Retail Auditor','active',date('now','-30 day'),'{}'),
 ('ASN-DEMO-006','ORG-DEFAULT','PRJ-DEMO-AUDIT','EMP-DEMO-006','Retail Auditor','active',date('now','-30 day'),'{}');

INSERT OR IGNORE INTO core_outlets(id,organization_id,client_id,code,name,address,latitude,longitude,geofence_radius_m,status,metadata_json)
VALUES
 ('OUT-DEMO-001','ORG-DEFAULT','CL-DEMO-FMCG','OUT001','Hypermart Kemang','Jl. Kemang Raya, Jakarta Selatan',-6.2607,106.8132,100,'active','{"channel":"Hypermarket"}'),
 ('OUT-DEMO-002','ORG-DEFAULT','CL-DEMO-FMCG','OUT002','Transmart Cempaka Putih','Jl. A. Yani, Jakarta Pusat',-6.1744,106.8767,100,'active','{"channel":"Hypermarket"}'),
 ('OUT-DEMO-003','ORG-DEFAULT','CL-DEMO-FMCG','OUT003','Superindo Alam Sutera','Alam Sutera, Tangerang',-6.2239,106.6597,80,'active','{"channel":"Supermarket"}'),
 ('OUT-DEMO-004','ORG-DEFAULT','CL-DEMO-FMCG','OUT004','AEON BSD City','BSD City, Tangerang Selatan',-6.3044,106.6442,120,'active','{"channel":"Modern Trade"}'),
 ('OUT-DEMO-005','ORG-DEFAULT','CL-DEMO-RETAIL','OUT005','Ritel Sejahtera Karawaci','Karawaci, Tangerang',-6.2262,106.6073,75,'active','{"channel":"Minimarket"}'),
 ('OUT-DEMO-006','ORG-DEFAULT','CL-DEMO-RETAIL','OUT006','Ritel Sejahtera Gading Serpong','Gading Serpong, Tangerang',-6.2425,106.6281,75,'active','{"channel":"Minimarket"}');

INSERT OR IGNORE INTO core_project_outlets(organization_id,project_id,outlet_id,status)
VALUES
 ('ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-001','active'),
 ('ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-002','active'),
 ('ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-003','active'),
 ('ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-004','active'),
 ('ORG-DEFAULT','PRJ-DEMO-AUDIT','OUT-DEMO-005','active'),
 ('ORG-DEFAULT','PRJ-DEMO-AUDIT','OUT-DEMO-006','active');

INSERT OR IGNORE INTO core_products(id,organization_id,client_id,sku,name,unit,status,metadata_json)
VALUES
 ('PROD-DEMO-001','ORG-DEFAULT','CL-DEMO-FMCG','SKU-001','Fresh Tea Original 350ml','botol','active','{"category":"Beverage","price":7500}'),
 ('PROD-DEMO-002','ORG-DEFAULT','CL-DEMO-FMCG','SKU-002','Fresh Tea Lemon 350ml','botol','active','{"category":"Beverage","price":7500}'),
 ('PROD-DEMO-003','ORG-DEFAULT','CL-DEMO-FMCG','SKU-003','Energy Plus 250ml','kaleng','active','{"category":"Beverage","price":9000}'),
 ('PROD-DEMO-004','ORG-DEFAULT','CL-DEMO-FMCG','SKU-004','Snack Crunch BBQ 70g','pack','active','{"category":"Snack","price":11000}'),
 ('PROD-DEMO-005','ORG-DEFAULT','CL-DEMO-RETAIL','SKU-005','Private Label Mineral Water','botol','active','{"category":"Beverage","price":4500}'),
 ('PROD-DEMO-006','ORG-DEFAULT','CL-DEMO-RETAIL','SKU-006','Private Label Tissue 250s','pack','active','{"category":"Household","price":18000}');

INSERT OR IGNORE INTO core_project_products(organization_id,project_id,product_id,status)
VALUES
 ('ORG-DEFAULT','PRJ-DEMO-SALES','PROD-DEMO-001','active'),
 ('ORG-DEFAULT','PRJ-DEMO-SALES','PROD-DEMO-002','active'),
 ('ORG-DEFAULT','PRJ-DEMO-SALES','PROD-DEMO-003','active'),
 ('ORG-DEFAULT','PRJ-DEMO-SALES','PROD-DEMO-004','active'),
 ('ORG-DEFAULT','PRJ-DEMO-AUDIT','PROD-DEMO-005','active'),
 ('ORG-DEFAULT','PRJ-DEMO-AUDIT','PROD-DEMO-006','active');

INSERT OR IGNORE INTO core_attendance(id,organization_id,project_id,employee_id,work_date,status,check_in_at,check_out_at,idempotency_key,metadata_json)
VALUES
 ('ATT-DEMO-001','ORG-DEFAULT','PRJ-DEMO-SALES','EMP-DEMO-001',date('now'),'present',datetime('now','-7 hour'),datetime('now','-1 hour'),'demo-att-001','{}'),
 ('ATT-DEMO-002','ORG-DEFAULT','PRJ-DEMO-SALES','EMP-DEMO-002',date('now'),'present',datetime('now','-7 hour'),datetime('now','-1 hour'),'demo-att-002','{}'),
 ('ATT-DEMO-003','ORG-DEFAULT','PRJ-DEMO-SALES','EMP-DEMO-003',date('now'),'late',datetime('now','-6 hour'),NULL,'demo-att-003','{}'),
 ('ATT-DEMO-004','ORG-DEFAULT','PRJ-DEMO-SALES','EMP-DEMO-004',date('now'),'present',datetime('now','-7 hour'),NULL,'demo-att-004','{}'),
 ('ATT-DEMO-005','ORG-DEFAULT','PRJ-DEMO-AUDIT','EMP-DEMO-005',date('now'),'present',datetime('now','-7 hour'),NULL,'demo-att-005','{}'),
 ('ATT-DEMO-006','ORG-DEFAULT','PRJ-DEMO-AUDIT','EMP-DEMO-006',date('now'),'leave',NULL,NULL,'demo-att-006','{}');

INSERT OR IGNORE INTO core_visits(id,organization_id,project_id,outlet_id,employee_id,status,scheduled_at,started_at,completed_at,idempotency_key,metadata_json)
VALUES
 ('VIS-DEMO-001','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-001','EMP-DEMO-001','completed',datetime('now','-6 hour'),datetime('now','-6 hour'),datetime('now','-5 hour'),'demo-vis-001','{"result":"display compliant"}'),
 ('VIS-DEMO-002','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-002','EMP-DEMO-002','completed',datetime('now','-5 hour'),datetime('now','-5 hour'),datetime('now','-4 hour'),'demo-vis-002','{"result":"promo active"}'),
 ('VIS-DEMO-003','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-003','EMP-DEMO-003','in_progress',datetime('now','-1 hour'),datetime('now','-1 hour'),NULL,'demo-vis-003','{}'),
 ('VIS-DEMO-004','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-004','EMP-DEMO-004','planned',datetime('now','+1 hour'),NULL,NULL,'demo-vis-004','{}'),
 ('VIS-DEMO-005','ORG-DEFAULT','PRJ-DEMO-AUDIT','OUT-DEMO-005','EMP-DEMO-005','completed',datetime('now','-4 hour'),datetime('now','-4 hour'),datetime('now','-3 hour'),'demo-vis-005','{"score":92}');

INSERT OR IGNORE INTO core_product_sales(id,organization_id,project_id,outlet_id,employee_id,product_id,quantity,unit_price,total_amount,sold_at,idempotency_key,metadata_json)
VALUES
 ('SALE-DEMO-001','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-001','EMP-DEMO-001','PROD-DEMO-001',24,7500,180000,datetime('now','-5 hour'),'demo-sale-001','{}'),
 ('SALE-DEMO-002','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-002','EMP-DEMO-002','PROD-DEMO-002',18,7500,135000,datetime('now','-4 hour'),'demo-sale-002','{}'),
 ('SALE-DEMO-003','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-003','EMP-DEMO-003','PROD-DEMO-003',12,9000,108000,datetime('now','-2 hour'),'demo-sale-003','{}');

INSERT OR IGNORE INTO core_competitors(id,organization_id,code,name,status,metadata_json)
VALUES
 ('CMP-DEMO-001','ORG-DEFAULT','CMP-A','Prima Beverage','active','{"category":"Beverage"}'),
 ('CMP-DEMO-002','ORG-DEFAULT','CMP-B','Snack Indonesia','active','{"category":"Snack"}');

INSERT OR IGNORE INTO core_competitor_products(id,organization_id,competitor_id,sku,name,unit,typical_price,status,metadata_json)
VALUES
 ('CPD-DEMO-001','ORG-DEFAULT','CMP-DEMO-001','CMP-SKU-01','Prima Tea 350ml','botol',7000,'active','{}'),
 ('CPD-DEMO-002','ORG-DEFAULT','CMP-DEMO-002','CMP-SKU-02','Snack Max 70g','pack',10500,'active','{}');

INSERT OR IGNORE INTO core_attendance_points(id,organization_id,code,name,type,address,latitude,longitude,radius_m,status,metadata_json)
VALUES
 ('APT-DEMO-OFFICE','ORG-DEFAULT','OFFICE-DEMO','Kantor Demo Jakarta','office','Jakarta Selatan',-6.2447,106.8006,150,'active','{}');

INSERT OR IGNORE INTO core_sync_state(organization_id,revision,cutover_mode,updated_at)
VALUES('ORG-DEFAULT',0,'cloud',CURRENT_TIMESTAMP);

UPDATE core_sync_state
SET revision=revision+1,
    cutover_mode='cloud',
    last_mutation_id='demo-dataset-v1',
    imported_at=COALESCE(imported_at,CURRENT_TIMESTAMP),
    updated_at=CURRENT_TIMESTAMP
WHERE organization_id='ORG-DEFAULT';
