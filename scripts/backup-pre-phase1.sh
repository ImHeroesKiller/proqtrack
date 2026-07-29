#!/usr/bin/env bash
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups/pre-phase1-$STAMP"
DB_NAME="proqtrack-mvp"
APP_URL="https://proqtrack.arywibowo.workers.dev"

mkdir -p "$BACKUP_DIR"

echo "[1/5] Recording git state..."
git -C "$ROOT_DIR" rev-parse HEAD > "$BACKUP_DIR/git-head.txt"
git -C "$ROOT_DIR" status --short > "$BACKUP_DIR/git-status.txt"
git -C "$ROOT_DIR" log -1 --oneline > "$BACKUP_DIR/git-log.txt"

echo "[2/5] Exporting remote D1 database..."
cd "$ROOT_DIR"
npx wrangler d1 export "$DB_NAME" --remote --output "$BACKUP_DIR/d1-proqtrack-mvp.sql"

echo "[3/5] Capturing D1 schema and row counts..."
npx wrangler d1 execute "$DB_NAME" --remote --command="SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;" > "$BACKUP_DIR/d1-schema.txt"
npx wrangler d1 execute "$DB_NAME" --remote --command="SELECT 'app_snapshots' AS table_name, COUNT(*) AS row_count FROM app_snapshots UNION ALL SELECT 'file_metadata', COUNT(*) FROM file_metadata UNION ALL SELECT 'report_generation_jobs', COUNT(*) FROM report_generation_jobs UNION ALL SELECT 'security_audit_logs', COUNT(*) FROM security_audit_logs UNION ALL SELECT 'usage_events', COUNT(*) FROM usage_events;" > "$BACKUP_DIR/d1-row-counts.txt"

echo "[4/5] Capturing production health response..."
curl -fsS "$APP_URL/api/health" > "$BACKUP_DIR/production-health.json"

echo "[5/5] Writing restore instructions..."
cat > "$BACKUP_DIR/RESTORE.txt" <<EOF
Application rollback branch:
  backup/pre-phase1-20260729

Restore application code:
  git fetch origin
  git checkout main
  git reset --hard origin/backup/pre-phase1-20260729
  git push --force-with-lease origin main
  npm ci
  npm run check
  npm run deploy

Restore D1 data into a NEW recovery database first:
  npx wrangler d1 create proqtrack-mvp-recovery-$STAMP
  # Add the returned database_id temporarily to wrangler recovery config.
  npx wrangler d1 execute proqtrack-mvp-recovery-$STAMP --remote --file "$BACKUP_DIR/d1-proqtrack-mvp.sql"

Do not overwrite the production D1 database until recovery validation passes.
R2 files are not modified by Phase 1 schema work. Keep the existing bucket binding unchanged.
EOF

echo "Backup complete: $BACKUP_DIR"
echo "Keep this directory outside git and copy it to a secure location."
