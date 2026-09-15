const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
export const PAGE_SIZE = 100;

function fmtMoney(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);
}

function photoSrc(p) {
  if (!p) return '';
  return p.watermarkUrl || p.photoUrl || p.dataUrl || '';
}

function stamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function buildActivityEvents(c, visit) {
  const events = [];
  const add = (at, kind, html) => events.push({ at: at || visit.date || '', kind, html });
  add(visit.checkInTime ? `${String(visit.date || visit.visitDate || '').slice(0, 10)}T${visit.checkInTime}` : visit.createdAt, 'Check-in', 'Visit check-in');
  (c.attendance || []).filter(a => a.employeeId === visit.employeeId && String(a.date || '').slice(0, 10) === String(visit.date || visit.visitDate || '').slice(0, 10))
    .forEach(a => add(a.checkInAt || a.createdAt || a.date, 'Attendance', `${esc(a.source || a.locationType || 'attendance')} · ${esc(a.checkInLocation || a.locationName || '')}`));
  (c.pairs || []).filter(p => p.visitId === visit.id).forEach(p => {
    const before = (c.photos || []).find(x => x.id === p.beforePhotoId);
    const after = (c.photos || []).find(x => x.id === p.afterPhotoId);
    add(p.createdAt, 'Rack Before', before ? stamp(before.recordedAt) : 'Waiting for After Photo');
    if (after) add(p.completedAt || after.recordedAt, 'Rack After', stamp(after.recordedAt));
  });
  (c.stocks || []).filter(s => s.outletId === visit.outletId).forEach(s => add(s.lastUpdated, 'Stock', esc(s.productId)));
  (c.prices || []).filter(p => p.visitId === visit.id || p.outletId === visit.outletId).forEach(p => add(p.recordedAt, 'Price', esc(String(p.observedPrice ?? ''))));
  (c.intel || []).filter(i => i.visitId === visit.id || i.outletId === visit.outletId).forEach(i => add(i.recordedAt, 'Competitor Intel', esc(String(i.shelfShare ?? ''))));
  (c.responses || []).filter(r => r.visitId === visit.id || (r.outletId === visit.outletId && r.employeeId === visit.employeeId))
    .forEach(r => add(r.submittedAt || r.createdAt, 'Survey', esc(r.status)));
  (c.sales || []).filter(s => s.visitId === visit.id || (s.outletId === visit.outletId && s.employeeId === visit.employeeId))
    .forEach(s => add(s.date || s.createdAt, 'Product Sales', fmtMoney(s.amount)));
  (c.photos || []).filter(p => p.visitId === visit.id).forEach(p => add(p.recordedAt, 'Field Photo', esc(p.photoType || p.type || 'photo')));
  add(visit.checkOutTime ? `${String(visit.date || '').slice(0, 10)}T${visit.checkOutTime}` : '', 'Check-out', visit.checkOutTime || 'Open');
  return events.filter(e => e.at || e.kind === 'Check-out').sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function rackBlock(c, visit) {
  const pair = (c.pairs || []).find(p => p.visitId === visit.id);
  const before = pair ? (c.photos || []).find(x => x.id === pair.beforePhotoId) : null;
  const after = pair ? (c.photos || []).find(x => x.id === pair.afterPhotoId) : null;
  const cell = (photo, label) => {
    const src = photoSrc(photo);
    const img = src ? `<img src="${esc(src)}" alt="${label}" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px">` : '<p class="rpt-empty" style="padding:16px">Not captured</p>';
    return `<div style="flex:1;min-width:140px"><strong>${label}</strong>${img}<div class="am-muted">${esc(stamp(photo?.recordedAt))}</div></div>`;
  };
  const status = after ? 'Completed' : before ? 'Waiting for After Photo' : 'No rack evidence';
  return `<div class="rpt-builder"><h4>BEFORE | AFTER</h4><p class="am-muted">${status}</p>
    <div class="rpt-rack">${cell(before, 'BEFORE')}${cell(after, 'AFTER')}</div></div>`;
}

export function activityPage(c) {
  const visits = (c.visits || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, PAGE_SIZE);
  if (!visits.length) {
    return `<div class="rpt-wrap"><div class="rpt-empty"><h3>No visits found</h3><p>No field visits in this scope and date range.</p></div></div>`;
  }
  const emp = id => c.employees.find(x => x.id === id)?.name || id || '—';
  const out = id => c.outlets.find(x => x.id === id) || {};
  const prj = id => c.projects.find(x => x.id === id);
  const cli = id => (c.db.clients || []).find(x => x.id === id);
  const cards = visits.map(v => {
    const o = out(v.outletId);
    const e = c.employees.find(x => x.id === v.employeeId) || {};
    const p = prj(v.projectId);
    const client = cli(p?.clientId);
    const events = buildActivityEvents(c, v);
    const photos = (c.photos || []).filter(ph => ph.visitId === v.id);
    return `<article class="rpt-builder" style="margin-bottom:16px">
      <h3>${esc(o.name || 'Outlet')}</h3>
      <p>${esc(client?.name || '—')} · ${esc(p?.name || v.projectId || '—')} · ${esc(o.code || o.id || '')}</p>
      <p>Employee ${esc(e.name || v.employeeId)} · Supervisor ${esc(emp(e.supervisorId))} · ${esc(v.date || v.visitDate || '')}</p>
      <p>Check-in ${esc(v.checkInTime || '—')} · Check-out ${esc(v.checkOutTime || '—')} · ${esc(o.address || '')}</p>
      <ol class="rpt-timeline">${events.map(ev => `<li><strong>${esc(ev.kind)}</strong> · ${ev.html}</li>`).join('')}</ol>
      ${photos.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${photos.map(ph => {
        const src = photoSrc(ph);
        return src
          ? `<figure style="margin:0;width:120px"><img src="${esc(src)}" alt="" style="width:120px;height:90px;object-fit:cover;border-radius:8px"><figcaption class="am-muted" style="font-size:10px">${esc(stamp(ph.recordedAt))} · ${esc(ph.lat && ph.lng ? `${ph.lat},${ph.lng}` : 'no GPS')}</figcaption></figure>`
          : '<span class="am-muted">Missing photo</span>';
      }).join('')}</div>` : '<p class="rpt-empty" style="padding:12px">No photo evidence</p>'}
      ${rackBlock(c, v)}
    </article>`;
  }).join('');
  return `<div class="rpt-wrap"><div class="rpt-page-title"><div><h3>Activity Report</h3><p>Chronology of field execution evidence. Showing up to ${PAGE_SIZE} visits.</p></div>
    <button class="btn btn-secondary btn-sm" type="button" onclick="window.print()">Print</button></div>${cards}
    <style>@media(min-width:700px){.rpt-rack{display:flex;gap:12px}}@media(max-width:699px){.rpt-rack{display:grid;gap:12px}}</style></div>`;
}

export function surveysPage(c) {
  const templates = c.surveys || [];
  if (!templates.length) return `<div class="rpt-wrap"><div class="rpt-empty"><h3>No surveys found</h3></div></div>`;
  const assigned = c.db.surveyAssignments || [];
  const rows = templates.map(s => {
    const asg = assigned.filter(a => a.surveyId === s.id);
    const resp = (c.responses || []).filter(r => r.surveyId === s.id && r.status === 'submitted');
    const pct = asg.length ? Math.round((resp.length / asg.length) * 100) : (resp.length ? 100 : 0);
    return [esc(s.name), esc(s.status), esc(c.projects.find(p => p.id === s.projectId)?.name || s.projectId || '—'),
      String(asg.length), String(resp.length), String(Math.max(0, asg.length - resp.length)), `${pct}%`];
  });
  const detailId = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('rptSurveyId')) || templates[0]?.id;
  const survey = templates.find(s => s.id === detailId) || templates[0];
  const answers = (c.responses || []).filter(r => r.surveyId === survey.id);
  const qs = (survey.questions || []).slice().sort((a, b) => a.order - b.order);
  const emp = id => c.employees.find(x => x.id === id)?.name || id || '—';
  const out = id => c.outlets.find(x => x.id === id)?.name || id || '—';
  const detail = answers.length
    ? answers.map(r => `<div class="rpt-builder" style="margin-top:10px"><strong>${esc(emp(r.employeeId))}</strong> · ${esc(out(r.outletId))} · ${esc(r.status)} · ${esc(stamp(r.submittedAt))}
        <ul>${qs.map(q => `<li>${esc(q.label)}: ${esc(Array.isArray(r.answers?.[q.id]) ? r.answers[q.id].join(', ') : (r.answers?.[q.id] ?? '—'))}</li>`).join('')}</ul></div>`).join('')
    : '<div class="rpt-empty">No responses yet.</div>';
  const header = ['Name', 'Status', 'Project', 'Assigned', 'Completed', 'Pending', 'Completion'];
  const table = `<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr>${header.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return `<div class="rpt-wrap"><div class="rpt-page-title"><div><h3>Survey reporting</h3><p>Completion and response detail follow the form builder order.</p></div></div>${table}<h4>Response detail</h4>${detail}</div>`;
}

export function salesPage(c) {
  const month = new Date().toISOString().slice(0, 7);
  const sales = (c.sales || []).filter(s => String(s.date || '').startsWith(month));
  const total = sales.reduce((n, s) => n + (Number(s.amount) || 0), 0);
  const target = (c.employees || []).reduce((n, e) => n + (Number(e.salesTargetAmount) || 0), 0);
  const pct = target ? Math.round((total / target) * 100) : 0;
  const group = (key, labelOf) => {
    const map = {};
    for (const s of sales) map[s[key] || '—'] = (map[s[key] || '—'] || 0) + (Number(s.amount) || 0);
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([id, amount]) => `<tr><td>${esc(labelOf(id))}</td><td>${fmtMoney(amount)}</td></tr>`).join('') || '<tr><td colspan="2">No sales this month</td></tr>';
  };
  const prod = id => c.products.find(p => p.id === id)?.name || id;
  const out = id => c.outlets.find(o => o.id === id)?.name || id;
  const emp = id => c.employees.find(e => e.id === id)?.name || id;
  return `<div class="rpt-wrap"><div class="rpt-grid">
    <div class="rpt-card"><strong>${fmtMoney(total)}</strong><span>Total sales</span></div>
    <div class="rpt-card"><strong>${fmtMoney(target)}</strong><span>Monthly target</span></div>
    <div class="rpt-card"><strong>${pct}%</strong><span>Achievement</span></div>
    <div class="rpt-card"><strong>${sales.length}</strong><span>Transactions</span></div>
  </div>
  <div class="rpt-builder"><h4>By product</h4><div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Product</th><th>Revenue</th></tr></thead><tbody>${group('productId', prod)}</tbody></table></div></div>
  <div class="rpt-builder"><h4>By outlet</h4><div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Outlet</th><th>Revenue</th></tr></thead><tbody>${group('outletId', out)}</tbody></table></div></div>
  <div class="rpt-builder"><h4>By employee</h4><div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Employee</th><th>Revenue</th></tr></thead><tbody>${group('employeeId', emp)}</tbody></table></div></div>
  <div class="rpt-builder"><h4>By supervisor</h4><div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Supervisor</th><th>Revenue</th></tr></thead><tbody>${group('supervisorId', emp)}</tbody></table></div></div>
  </div>`;
}

export function exportCsv(table, cols, rows, colLabel = k => k) {
  if (typeof document === 'undefined') return { table, cols, rows };
  const headers = cols.map(colLabel);
  const line = arr => arr.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  const body = rows.map(r => line(cols.map(k => {
    const v = r?.[k];
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  })));
  const csv = [line(headers), ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  const day = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = `ProQTrack_${table || 'Report'}_${day}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return { fileName: a.download, rowCount: rows.length };
}
