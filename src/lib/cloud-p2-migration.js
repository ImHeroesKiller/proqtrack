// Isolated legacy P2 migration selector; no network or storage side-effects.
const clone = value => JSON.parse(JSON.stringify(value));
const sameOrganization = (row, organizationId) =>
  !!organizationId && String(row?.organizationId || '') === String(organizationId);

const P2_OPERATIONAL_COLLECTIONS = Object.freeze(['priceObservations','competitorIntel','outletProposals']);

function operationalOwnerId(entity, row = {}) {
  if (entity === 'outletProposals') return String(row.submittedBy || row.employeeId || '');
  return String(row.recordedBy || row.employeeId || '');
}

function localActorEmployeeId(localDb = {}, account = {}) {
  const accountId = String(account.sub || account.id || '');
  const email = String(account.email || '').toLowerCase();
  const linked = (localDb.employees || []).find(row =>
    String(row.authUserId || '') === accountId
    || (email && String(row.email || '').toLowerCase() === email)
  );
  if (linked?.id) return String(linked.id);
  const localAccount = (localDb.accounts || []).find(row =>
    String(row.id || '') === accountId || (email && String(row.email || '').toLowerCase() === email)
  );
  return String(localAccount?.employeeId || '');
}

export function p2OperationalMigrationChanges(localDb = {}, remoteData = {}, account = {}) {
  const organizationId = String(account.organizationId || account.organization?.id || localDb.currentOrganizationId || '');
  if (!organizationId) return [];
  const broad = ['superadmin','head','admin'].includes(String(account.role || '').toLowerCase());
  const ownEmployeeId = localActorEmployeeId(localDb, account);
  const projects = new Set((remoteData.projects || []).map(row => String(row.id || '')));
  const outlets = new Set((remoteData.outlets || []).map(row => String(row.id || '')));
  const products = new Set((remoteData.products || []).map(row => String(row.id || '')));
  const employees = new Set((remoteData.employees || []).map(row => String(row.id || '')));
  const visits = new Set((remoteData.visits || []).map(row => String(row.id || '')));
  const competitorProducts = new Set((remoteData.competitorProducts || []).map(row => String(row.id || '')));
  const changes = [];

  for (const entity of P2_OPERATIONAL_COLLECTIONS) {
    const remoteIds = new Set((remoteData[entity] || []).map(row => String(row.id || '')));
    for (const source of Array.isArray(localDb[entity]) ? localDb[entity] : []) {
      const row = clone(source);
      const id = String(row.id || '');
      if (!id || remoteIds.has(id) || !sameOrganization(row, organizationId)) continue;
      const owner = operationalOwnerId(entity, row);
      if (!broad && (!ownEmployeeId || owner !== ownEmployeeId)) continue;
      const projectId = String(row.projectId || '');
      if (!projectId || !projects.has(projectId) || !owner || !employees.has(owner)) continue;
      if (entity !== 'outletProposals' && !outlets.has(String(row.outletId || ''))) continue;
      if (row.visitId && !visits.has(String(row.visitId))) row.visitId = null;
      if (entity === 'priceObservations' && !products.has(String(row.productId || ''))) continue;
      if (entity === 'competitorIntel') {
        if (row.productId && !products.has(String(row.productId))) row.productId = null;
        if (row.competitorProductId && !competitorProducts.has(String(row.competitorProductId))) row.competitorProductId = null;
      }
      row.organizationId = organizationId;
      if (!row.employeeId) row.employeeId = owner;
      changes.push({ entity, op: 'upsert', row });
    }
  }
  return changes;
}

