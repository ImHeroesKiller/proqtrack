function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function changeKey(row) {
  return String(row?.id || (row?.projectId && row?.productId ? `${row.projectId}:${row.productId}` : ''));
}

function asMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = changeKey(row);
    if (key) map.set(key, row);
  }
  return map;
}

function applyChanges(target = {}, changes = []) {
  const next = clone(target) || {};
  for (const change of changes) {
    if (!Array.isArray(next[change.entity])) next[change.entity] = [];
    const rows = next[change.entity];
    const key = changeKey(change.row);
    const index = rows.findIndex(row => changeKey(row) === key);
    if (change.op === 'delete') {
      if (index >= 0) rows.splice(index, 1);
    } else if (index >= 0) rows[index] = clone(change.row);
    else rows.push(clone(change.row));
  }
  return next;
}

function diffSnapshots(previous = {}, current = {}, collections = []) {
  const changes = [];
  for (const entity of collections) {
    const before = asMap(previous[entity] || []);
    const after = asMap(current[entity] || []);
    for (const [id, row] of after.entries()) {
      const old = before.get(id);
      if (!old || stable(old) !== stable(row)) changes.push({ entity, op:'upsert', row:clone(row) });
    }
    for (const [id, row] of before.entries()) {
      if (!after.has(id)) changes.push({ entity, op:'delete', row:clone(row) });
    }
  }
  return changes;
}

export function createCloudRebaseTools(collections = []) {
  const entityList = [...collections];

  function snapshotRow(snapshot = {}, entity = '', row = null) {
    const key = changeKey(row);
    if (!key) return null;
    return asMap(snapshot?.[entity] || []).get(key) || null;
  }

  function mergeRowThreeWay(baseRow, localRow, remoteRow) {
    if (!baseRow) {
      if (!remoteRow) return { row:clone(localRow), conflicts:0, appliedFields:Object.keys(localRow || {}).length };
      return { row:clone(remoteRow), conflicts:1, appliedFields:0 };
    }
    if (!remoteRow) return { row:null, conflicts:1, appliedFields:0 };

    const merged = clone(remoteRow);
    let conflicts = 0;
    let appliedFields = 0;
    const keys = new Set([...Object.keys(baseRow || {}), ...Object.keys(localRow || {})]);

    for (const key of keys) {
      const baseValue = baseRow?.[key];
      const localValue = localRow?.[key];
      const remoteValue = remoteRow?.[key];
      const localChanged = stable(baseValue) !== stable(localValue);
      if (!localChanged) continue;
      const remoteChanged = stable(baseValue) !== stable(remoteValue);
      if (remoteChanged && stable(localValue) !== stable(remoteValue)) {
        conflicts += 1;
        continue;
      }
      if (localValue === undefined) delete merged[key];
      else merged[key] = clone(localValue);
      appliedFields += 1;
    }

    return { row:merged, conflicts, appliedFields };
  }

  function rebaseSnapshotIntent(baseSnapshot = {}, localSnapshot = {}, remoteSnapshot = {}) {
    const intent = diffSnapshots(baseSnapshot, localSnapshot, entityList);
    const rebased = [];
    let conflictFields = 0;
    let droppedChanges = 0;

    for (const change of intent) {
      const baseRow = snapshotRow(baseSnapshot, change.entity, change.row);
      const remoteRow = snapshotRow(remoteSnapshot, change.entity, change.row);

      if (change.op === 'delete') {
        if (!remoteRow) continue;
        if (baseRow && stable(remoteRow) === stable(baseRow)) {
          rebased.push({ entity:change.entity, op:'delete', row:clone(remoteRow) });
        } else {
          droppedChanges += 1;
        }
        continue;
      }

      const merged = mergeRowThreeWay(baseRow, change.row, remoteRow);
      conflictFields += merged.conflicts;
      if (!merged.row) {
        droppedChanges += 1;
        continue;
      }
      if (!remoteRow || stable(merged.row) !== stable(remoteRow)) {
        rebased.push({ entity:change.entity, op:'upsert', row:merged.row });
      } else if (merged.appliedFields === 0 && baseRow) {
        droppedChanges += 1;
      }
    }

    return {
      changes:rebased,
      mergedSnapshot:applyChanges(remoteSnapshot, rebased),
      intentCount:intent.length,
      conflictFields,
      droppedChanges,
    };
  }

  function rebaseStoredIntent(storedChanges = [], remoteSnapshot = {}) {
    const rebased = [];
    let conflictFields = 0;
    let droppedChanges = 0;

    for (const stored of Array.isArray(storedChanges) ? storedChanges : []) {
      if (!stored?.entity || !stored?.op || !stored?.row) continue;
      const remoteRow = snapshotRow(remoteSnapshot, stored.entity, stored.row);
      const baseRow = stored.baseRow || null;

      if (stored.op === 'delete') {
        if (!remoteRow) continue;
        if (baseRow && stable(remoteRow) === stable(baseRow)) {
          rebased.push({ entity:stored.entity, op:'delete', row:clone(remoteRow) });
        } else {
          droppedChanges += 1;
        }
        continue;
      }

      const merged = mergeRowThreeWay(baseRow, stored.row, remoteRow);
      conflictFields += merged.conflicts;
      if (!merged.row) {
        droppedChanges += 1;
        continue;
      }
      if (!remoteRow || stable(merged.row) !== stable(remoteRow)) {
        rebased.push({ entity:stored.entity, op:'upsert', row:merged.row });
      } else if (merged.appliedFields === 0 && baseRow) {
        droppedChanges += 1;
      }
    }

    return {
      changes:rebased,
      mergedSnapshot:applyChanges(remoteSnapshot, rebased),
      conflictFields,
      droppedChanges,
    };
  }

  function cloudWinTargetForChange(targetSnapshot, cloudSnapshot, change) {
    const remoteRow = snapshotRow(cloudSnapshot, change?.entity, change?.row);
    if (remoteRow) {
      return applyChanges(targetSnapshot, [{ entity:change.entity, op:'upsert', row:clone(remoteRow) }]);
    }
    return applyChanges(targetSnapshot, [{ entity:change.entity, op:'delete', row:clone(change.row) }]);
  }

  return Object.freeze({
    changeKey,
    snapshotRow,
    mergeRowThreeWay,
    rebaseSnapshotIntent,
    rebaseStoredIntent,
    cloudWinTargetForChange,
  });
}
