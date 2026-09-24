-- P1 Stock/Sales lifecycle, legacy cleanup, correction governance and sync authority

-- Consolidate legacy duplicate stock rows before enforcing one authoritative
-- balance per organization/project/outlet/product.
DELETE FROM core_stocks
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY organization_id,project_id,outlet_id,product_id
        ORDER BY
          CASE WHEN COALESCE(json_extract(metadata_json,'$.provenance'),'')='inventory_cycle' THEN 0 ELSE 1 END,
          datetime(updated_at) DESC,
          datetime(created_at) DESC,
          id DESC
      ) AS duplicate_rank
    FROM core_stocks
  )
  WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_core_stocks_authoritative_balance
  ON core_stocks(organization_id,project_id,outlet_id,product_id);

-- Existing non-derived sales remain visible but are explicitly classified as
-- legacy/manual records. New manual sales are governed by application policy.
UPDATE core_product_sales
SET metadata_json=json_set(
  COALESCE(NULLIF(metadata_json,''),'{}'),
  '$.provenance',
  COALESCE(json_extract(metadata_json,'$.provenance'),'manual_legacy'),
  '$.lifecycleStatus',
  COALESCE(json_extract(metadata_json,'$.lifecycleStatus'),'active')
)
WHERE COALESCE(json_extract(metadata_json,'$.lifecycleStatus'),'')='';

CREATE INDEX IF NOT EXISTS idx_core_sales_lifecycle
  ON core_product_sales(
    organization_id,
    project_id,
    json_extract(metadata_json,'$.lifecycleStatus'),
    sold_at
  );

CREATE INDEX IF NOT EXISTS idx_inventory_cycles_correction
  ON core_inventory_cycles(
    organization_id,
    project_id,
    outlet_id,
    product_id,
    json_extract(metadata_json,'$.correctionOfCycleId')
  );
