const clampDays = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

async function staleEvidence(env, maxRows = 100) {
  const rows = await env.DB.prepare(`
    SELECT id,organization_id,object_key,content_sha256,updated_at
    FROM core_field_evidence
    WHERE storage_status='uploading'
      AND updated_at < datetime('now','-1 hour')
    ORDER BY updated_at ASC
    LIMIT ?
  `).bind(maxRows).all();

  let cleaned = 0;
  let failed = 0;
  for (const row of rows?.results || []) {
    try {
      if (row.object_key && env.FILES) await env.FILES.delete(row.object_key);
      await env.DB.prepare(`
        DELETE FROM core_field_evidence
        WHERE id=? AND organization_id=? AND storage_status='uploading'
      `).bind(row.id, row.organization_id).run();
      cleaned += 1;
    } catch (error) {
      failed += 1;
      console.warn('stale_evidence_cleanup_failed', {
        evidenceId: row.id,
        error: error?.message || String(error),
      });
    }
  }
  return { scanned: (rows?.results || []).length, cleaned, failed };
}

export async function runProductionMaintenance(env) {
  const id = crypto.randomUUID();
  const retentionDays = clampDays(env.OBSERVABILITY_RETENTION_DAYS, 14, 1, 90);
  const maintenanceDays = clampDays(env.MAINTENANCE_RETENTION_DAYS, 30, 7, 180);
  const detail = {};

  try {
    await env.DB.prepare(`
      INSERT INTO core_maintenance_runs(id,task,status,detail_json,started_at)
      VALUES(?,'production_housekeeping','running','{}',CURRENT_TIMESTAMP)
    `).bind(id).run();

    const expired = await env.DB.prepare(`
      UPDATE core_auth_sessions
      SET status='expired'
      WHERE status='active' AND expires_at <= CURRENT_TIMESTAMP
    `).run();
    detail.sessionsExpired = Number(expired?.meta?.changes || 0);

    const rateCleanup = await env.DB.prepare(`
      DELETE FROM core_rate_limit_buckets WHERE expires_at < CURRENT_TIMESTAMP
    `).run();
    detail.rateBucketsDeleted = Number(rateCleanup?.meta?.changes || 0);

    const metricCleanup = await env.DB.prepare(`
      DELETE FROM core_observability_minute
      WHERE bucket_minute < datetime('now', ?)
    `).bind(`-${retentionDays} days`).run();
    detail.metricBucketsDeleted = Number(metricCleanup?.meta?.changes || 0);

    detail.evidence = await staleEvidence(env);

    const runCleanup = await env.DB.prepare(`
      DELETE FROM core_maintenance_runs
      WHERE started_at < datetime('now', ?) AND id<>?
    `).bind(`-${maintenanceDays} days`, id).run();
    detail.maintenanceRunsDeleted = Number(runCleanup?.meta?.changes || 0);

    await env.DB.prepare(`
      UPDATE core_maintenance_runs
      SET status='success',detail_json=?,completed_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(JSON.stringify(detail), id).run();
    console.log(JSON.stringify({ event: 'production_maintenance', id, status: 'success', ...detail }));
    return { id, status: 'success', ...detail };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 500);
    try {
      await env.DB.prepare(`
        UPDATE core_maintenance_runs
        SET status='failed',detail_json=?,completed_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(JSON.stringify({ ...detail, error: message }), id).run();
    } catch { /* best effort */ }
    console.error('production_maintenance_failed', { id, error: message });
    throw error;
  }
}

export const __test = { clampDays };
