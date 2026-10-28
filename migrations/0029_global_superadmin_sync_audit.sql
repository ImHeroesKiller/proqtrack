-- Allow global superadmin actors to be audited without fake tenant membership.
-- The actor identity is global (auth_users), while the mutation remains tenant-scoped
-- through organization_id. Existing mutation history is preserved.

CREATE TABLE core_sync_mutations_v2 (
  organization_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  base_revision INTEGER NOT NULL CHECK(base_revision >= 0),
  applied_revision INTEGER NOT NULL CHECK(applied_revision >= 0),
  change_count INTEGER NOT NULL DEFAULT 0 CHECK(change_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, mutation_id),
  FOREIGN KEY (organization_id) REFERENCES core_organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES auth_users(id) ON DELETE RESTRICT
);

INSERT INTO core_sync_mutations_v2(
  organization_id,mutation_id,actor_user_id,base_revision,applied_revision,change_count,created_at
)
SELECT
  organization_id,mutation_id,actor_user_id,base_revision,applied_revision,change_count,created_at
FROM core_sync_mutations;

DROP TABLE core_sync_mutations;
ALTER TABLE core_sync_mutations_v2 RENAME TO core_sync_mutations;

CREATE INDEX IF NOT EXISTS idx_core_sync_mutations_revision
  ON core_sync_mutations(organization_id, applied_revision DESC);
