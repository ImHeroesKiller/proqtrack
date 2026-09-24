-- UAT hardening: allow same-day correction cycles while preserving one base cycle per day.
-- Rebuild removes the table-level daily UNIQUE constraint from 0025.

PRAGMA foreign_keys=OFF;

CREATE TABLE core_inventory_cycles_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  visit_id TEXT,
  cycle_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','finalized')),
  opening_qty REAL NOT NULL DEFAULT 0 CHECK(opening_qty >= 0),
  stock_in_qty REAL NOT NULL DEFAULT 0 CHECK(stock_in_qty >= 0),
  adjustment_qty REAL NOT NULL DEFAULT 0,
  return_qty REAL NOT NULL DEFAULT 0 CHECK(return_qty >= 0),
  damaged_qty REAL NOT NULL DEFAULT 0 CHECK(damaged_qty >= 0),
  transfer_out_qty REAL NOT NULL DEFAULT 0 CHECK(transfer_out_qty >= 0),
  closing_qty REAL NOT NULL DEFAULT 0 CHECK(closing_qty >= 0),
  sell_out_qty REAL NOT NULL DEFAULT 0 CHECK(sell_out_qty >= 0),
  unit_price REAL CHECK(unit_price IS NULL OR unit_price >= 0),
  sales_amount REAL CHECK(sales_amount IS NULL OR sales_amount >= 0),
  sale_id TEXT,
  idempotency_key TEXT,
  finalized_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, organization_id) REFERENCES core_projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (outlet_id, organization_id) REFERENCES core_outlets(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, organization_id) REFERENCES core_products(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id, organization_id) REFERENCES core_employees(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (visit_id, organization_id) REFERENCES core_visits(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_id, organization_id) REFERENCES core_product_sales(id, organization_id) ON DELETE RESTRICT
);

INSERT INTO core_inventory_cycles_v2(
  id,organization_id,project_id,outlet_id,product_id,employee_id,visit_id,cycle_date,status,
  opening_qty,stock_in_qty,adjustment_qty,return_qty,damaged_qty,transfer_out_qty,closing_qty,
  sell_out_qty,unit_price,sales_amount,sale_id,idempotency_key,finalized_at,metadata_json,row_version,
  created_at,updated_at
)
SELECT
  id,organization_id,project_id,outlet_id,product_id,employee_id,visit_id,cycle_date,status,
  opening_qty,stock_in_qty,adjustment_qty,return_qty,damaged_qty,transfer_out_qty,closing_qty,
  sell_out_qty,unit_price,sales_amount,sale_id,idempotency_key,finalized_at,metadata_json,row_version,
  created_at,updated_at
FROM core_inventory_cycles;

DROP TABLE core_inventory_cycles;
ALTER TABLE core_inventory_cycles_v2 RENAME TO core_inventory_cycles;

CREATE UNIQUE INDEX uq_inventory_cycles_daily_base
  ON core_inventory_cycles(organization_id,project_id,outlet_id,product_id,cycle_date)
  WHERE COALESCE(json_extract(metadata_json,'$.correctionOfCycleId'),'')='';

CREATE UNIQUE INDEX uq_inventory_cycles_correction_source
  ON core_inventory_cycles(organization_id,json_extract(metadata_json,'$.correctionOfCycleId'))
  WHERE COALESCE(json_extract(metadata_json,'$.correctionOfCycleId'),'')<>'';

CREATE INDEX idx_inventory_cycles_scope
  ON core_inventory_cycles(organization_id,project_id,outlet_id,product_id,cycle_date);

CREATE INDEX idx_inventory_cycles_employee
  ON core_inventory_cycles(organization_id,employee_id,cycle_date);

CREATE INDEX idx_inventory_cycles_correction
  ON core_inventory_cycles(
    organization_id,project_id,outlet_id,product_id,
    json_extract(metadata_json,'$.correctionOfCycleId')
  );

PRAGMA foreign_keys=ON;
