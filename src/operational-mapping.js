import { getDB, saveDB, getActor, withOrg, getLinkedProjectIds } from './lib/db.js';

const esc = (v = '') =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&',
    '<': '<',
    '>': '>',
    '"': '"',
    "'": '&#039;',
  }[c]));

function canManageMapping() {
  const actor = getActor();
  return actor && (actor.role === 'manager' || actor.role === 'superadmin');
}

function selectedIds(db, projectId, type) {
  if (type === 'products') {
    return new Set(
      (db.projectProducts || [])
        .filter((x) => x.projectId === projectId && x.status !== 'inactive')
        .map((x) => x.productId),
    );
  }
  return new Set(
    (db.projectAssignments || [])
      .filter((x) => x.projectId === projectId && x.status === 'active')
      .map((x) => x.employeeId),
  );
}

function option(rows, label) {
  return '<option value="">Pilih</option>' + rows.map((x) => `<option value="${esc(x.id)}">${esc(label(x))}</option>`).join('');
}

function ensureRelations() {
  const db = getDB();
  let changed = false;
  if (!Array.isArray(db.projectProducts)) {
    db.projectProducts = [];
    changed = true;
  }
  for (const project of db.projects || []) {
    const existing = new Set(
      db.projectProducts
        .filter((x) => x.projectId === project.id && x.status !== 'inactive')
        .map((x) => x.productId),
    );
    if (existing.size) continue;
    for (const product of db.products || []) {
      if (product.clientId && product.clientId === project.clientId) {
        db.projectProducts.push(withOrg({
          id: `PP-${project.id}-${product.id}`,
          projectId: project.id,
          productId: product.id,
          status: 'active',
          createdAt: new Date().toISOString(),
        }));
        changed = true;
      }
    }
  }
  if (changed) saveDB();
}

function mappingPanel() {
  const db = getDB();
  return `<section id="operationalMappingPanel" class="card" style="margin-top:18px">
    <div class="card-title">Mapping Operasional Project</div>
    <div class="card-subtitle">Atur hierarki Klien → Project → Produk dan Karyawan</div>
    <div class="form-row" style="margin-top:14px">
      <div class="form-group"><label class="label">Klien</label><select id="mapClient" class="select">${option(db.clients || [], (x) => x.name)}</select></div>
      <div class="form-group"><label class="label">Project</label><select id="mapProject" class="select" disabled><option value="">Pilih klien dahulu</option></select></div>
    </div>
    <div id="mapChoices" style="display:none">
      <div class="grid-2" style="margin-top:12px">
        <div><div class="label">Produk untuk project</div><div id="mapProducts" class="mapping-list"></div></div>
        <div><div class="label">Karyawan untuk project</div><div id="mapEmployees" class="mapping-list"></div></div>
      </div>
      <button id="saveOperationalMapping" class="btn btn-primary" style="margin-top:14px">Simpan Mapping</button>
    </div>
  </section>`;
}

function renderChoices() {
  const db = getDB();
  const projectId = document.getElementById('mapProject')?.value || '';
  const wrap = document.getElementById('mapChoices');
  if (!wrap) return;
  if (!projectId) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  const productIds = selectedIds(db, projectId, 'products');
  const employeeIds = selectedIds(db, projectId, 'employees');
  document.getElementById('mapProducts').innerHTML =
    (db.products || [])
      .map((p) => `<label class="mapping-item"><input type="checkbox" value="${esc(p.id)}" ${productIds.has(p.id) ? 'checked' : ''}> <span>${esc(p.name)}${p.sku ? ` <small>${esc(p.sku)}</small>` : ''}</span></label>`)
      .join('') || '<div class="rpt-empty">Belum ada produk.</div>';
  document.getElementById('mapEmployees').innerHTML =
    (db.employees || [])
      .filter((e) => e.status === 'active')
      .map((e) => `<label class="mapping-item"><input type="checkbox" value="${esc(e.id)}" ${employeeIds.has(e.id) ? 'checked' : ''}> <span>${esc(e.name)} <small>${esc(e.role || '')}</small></span></label>`)
      .join('') || '<div class="rpt-empty">Belum ada karyawan aktif.</div>';
}

function saveMapping(project, panel) {
  if (!canManageMapping()) {
    window.showToast?.('Akses ditolak', 'error');
    return;
  }
  const db = getDB();
  const projectId = project.value;
  if (!projectId) {
    window.showToast?.('Pilih project terlebih dahulu', 'error');
    return;
  }
  const products = [...panel.querySelectorAll('#mapProducts input:checked')].map((x) => x.value);
  const employees = [...panel.querySelectorAll('#mapEmployees input:checked')].map((x) => x.value);
  db.projectProducts = (db.projectProducts || []).filter((x) => x.projectId !== projectId);
  products.forEach((productId) => {
    db.projectProducts.push(withOrg({
      id: `PP-${projectId}-${productId}`,
      projectId,
      productId,
      status: 'active',
      updatedAt: new Date().toISOString(),
    }));
  });
  db.projectAssignments = db.projectAssignments || [];
  for (const assignment of db.projectAssignments.filter((x) => x.projectId === projectId && x.status === 'active' && !employees.includes(x.employeeId))) {
    assignment.status = 'removed';
    assignment.updatedAt = new Date().toISOString();
  }
  for (const employeeId of employees) {
    if (!db.projectAssignments.some((x) => x.projectId === projectId && x.employeeId === employeeId && x.status === 'active')) {
      db.projectAssignments.push(withOrg({
        id: `ASN-${Date.now()}-${employeeId}`,
        projectId,
        employeeId,
        roleOnProject: 'sales',
        startDate: new Date().toISOString().slice(0, 10),
        status: 'active',
      }));
    }
  }
  saveDB();
  window.showToast?.('Mapping project disimpan', 'success');
}

function bindPanel() {
  const panel = document.getElementById('operationalMappingPanel');
  if (!panel || panel.dataset.bound === '1') return;
  panel.dataset.bound = '1';
  const client = panel.querySelector('#mapClient');
  const project = panel.querySelector('#mapProject');
  client.addEventListener('change', () => {
    const db = getDB();
    const rows = (db.projects || []).filter((p) => p.clientId === client.value);
    project.innerHTML = option(rows, (p) => `${p.code || p.id} — ${p.name}`);
    project.disabled = !client.value;
    renderChoices();
  });
  project.addEventListener('change', renderChoices);
  panel.querySelector('#saveOperationalMapping').addEventListener('click', () => saveMapping(project, panel));
}

function ensureHierarchy(form) {
  if (!form || form.dataset.strictHierarchy === '1') return;
  const product = form.querySelector('select[name="productId"]');
  const outlet = form.querySelector('select[name="outletId"],select[name="storeId"]');
  const employee = form.querySelector('select[name="employeeId"]');
  if (!product && !outlet && !employee) return;
  form.dataset.strictHierarchy = '1';
  let client = form.querySelector('select[name="clientId"]');
  let project = form.querySelector('select[name="projectId"]');
  const anchor = (project || outlet || product || employee)?.closest('.form-group,div');
  if (!project) {
    const group = document.createElement('div');
    group.className = 'form-group';
    group.innerHTML = '<label class="label">Project</label><select class="select" name="projectId" required><option value="">Pilih klien dahulu</option></select>';
    anchor?.before(group);
    project = group.querySelector('select');
  }
  if (!client) {
    const group = document.createElement('div');
    group.className = 'form-group';
    group.innerHTML = '<label class="label">Klien</label><select class="select" name="clientId" required></select>';
    project.closest('.form-group,div')?.before(group);
    client = group.querySelector('select');
  }
  client.innerHTML = option(getDB().clients || [], (x) => x.name);
  const refill = () => {
    const current = project.value;
    project.innerHTML = option(
      (getDB().projects || []).filter((p) => p.clientId === client.value),
      (p) => `${p.code || p.id} — ${p.name}`,
    );
    if ([...project.options].some((o) => o.value === current)) project.value = current;
    project.disabled = !client.value;
    syncChildren();
  };
  const syncChildren = () => {
    const data = getDB();
    const pid = project.value;
    const pids = selectedIds(data, pid, 'products');
    const eids = selectedIds(data, pid, 'employees');
    const rowsOut = (data.outlets || data.stores || []).filter((x) => getLinkedProjectIds(x).includes(pid));
    const rowsProd = (data.products || []).filter((x) => pids.has(x.id));
    const rowsEmp = (data.employees || []).filter((x) => eids.has(x.id) && x.status === 'active');
    for (const [el, rows, label] of [
      [outlet, rowsOut, (x) => x.name],
      [product, rowsProd, (x) => `${x.name}${x.sku ? ` — ${x.sku}` : ''}`],
      [employee, rowsEmp, (x) => `${x.name}${x.role ? ` — ${x.role}` : ''}`],
    ]) {
      if (!el) continue;
      const current = el.value;
      el.innerHTML = '<option value="">Pilih</option>' + rows.map((x) => `<option value="${esc(x.id)}">${esc(label(x))}</option>`).join('');
      if (rows.some((x) => x.id === current)) el.value = current;
      el.disabled = !pid;
    }
  };
  client.addEventListener('change', refill);
  project.addEventListener('change', syncChildren);
  refill();
}

function enhance() {
  ensureRelations();
  if (location.hash === '#/projects') {
    const content = document.querySelector('.content');
    if (content && !document.getElementById('operationalMappingPanel')) {
      content.insertAdjacentHTML('beforeend', mappingPanel());
      bindPanel();
    }
  }
  document.querySelectorAll('form').forEach(ensureHierarchy);
}

function schedule() {
  setTimeout(enhance, 100);
  setTimeout(enhance, 260);
}

window.addEventListener('hashchange', schedule);
window.addEventListener('proqtrack:db-updated', schedule);
schedule();

const style = document.createElement('style');
style.textContent = '.mapping-list{max-height:280px;overflow:auto;border:1px solid var(--gray-200);border-radius:10px;padding:8px;background:#fff}.mapping-item{display:flex;gap:8px;align-items:center;padding:8px;border-radius:8px}.mapping-item:hover{background:var(--gray-50)}.mapping-item small{color:var(--gray-400)}';
document.head.appendChild(style);

export {};
