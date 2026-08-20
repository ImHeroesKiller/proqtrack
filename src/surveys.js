import {
  getSurveyTemplates, getSurveyTemplate, createSurveyTemplate, updateSurveyTemplate,
  assignSurvey, getSurveyAssignments, surveysForField, saveSurveyDraft, submitSurveyResponse,
  getSurveyResponses, surveyMonitoring, SURVEY_QUESTION_TYPES,
  getEmployees, getOutlets, getProducts, formatOutletLabel,
  getActor, isProjectAdminRole,
} from './lib/db.js';
import { esc, todayISO, formatCurrency } from './lib/utils.js';

const TYPE_LABEL = {
  short_text: 'Short Text', long_text: 'Long Text', number: 'Number', currency: 'Currency',
  single_choice: 'Single Choice', multiple_choice: 'Multiple Choice', dropdown: 'Dropdown',
  yes_no: 'Yes / No', date: 'Date', time: 'Time', rating: 'Rating', photo: 'Photo',
  product: 'Product', outlet: 'Outlet',
};

function canBuild() {
  return isProjectAdminRole(getActor()?.role);
}

export function renderSurveyList({ field = false } = {}) {
  const templates = field ? surveysForField() : getSurveyTemplates();
  const responses = getSurveyResponses();
  if (field) {
    if (!templates.length) return `<div class="empty-state"><h3>No surveys assigned</h3><p>Active surveys for your project will appear here.</p></div>`;
    return `<div class="card"><div class="card-title">My surveys</div>
      ${templates.map(s => {
        const mine = responses.filter(r => r.surveyId === s.id && r.employeeId === getActor()?.employeeId);
        const submitted = mine.some(r => r.status === 'submitted');
        return `<div class="list-row" style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--gray-100)">
          <div><strong>${esc(s.name)}</strong><div class="mq-muted">${esc(s.description || '')}</div></div>
          <button class="btn btn-sm ${submitted ? 'btn-secondary' : 'btn-primary'}" ${submitted ? 'disabled' : ''} onclick="Surveys.openFill('${s.id}')">${submitted ? 'Submitted' : 'Open'}</button>
        </div>`;
      }).join('')}</div>`;
  }
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div class="card-title" style="margin:0">Survey templates</div>
        ${canBuild() ? `<button class="btn btn-primary" onclick="Surveys.openBuilder()">New survey</button>` : ''}
      </div>
      ${templates.length ? `<div class="visits-table-wrapper" style="margin-top:12px"><table class="table">
        <thead><tr><th>Name</th><th>Status</th><th>Window</th><th>Questions</th><th></th></tr></thead>
        <tbody>${templates.map(s => `<tr>
          <td><strong>${esc(s.name)}</strong></td>
          <td>${esc(s.status)}</td>
          <td>${esc(s.startDate || '—')} – ${esc(s.endDate || '—')}</td>
          <td>${(s.questions || []).length}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="Surveys.openBuilder('${s.id}')">Edit</button>
            <button class="btn btn-secondary btn-sm" onclick="Surveys.openAssign('${s.id}')">Assign</button>
            <button class="btn btn-secondary btn-sm" onclick="Surveys.openMonitor('${s.id}')">Monitor</button></td>
        </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><h3>No surveys yet</h3><p>Create a template, then assign it to a project, supervisor, sales, or outlet.</p></div>`}
    </div>`;
}

function questionRow(q, i) {
  const opts = (q.options || []).join('\n');
  return `<div class="card" data-q="${esc(q.id)}" style="margin-bottom:10px">
    <div class="form-row">
      <div class="form-group"><label class="label">Label</label><input class="input" name="qlabel" value="${esc(q.label || '')}"></div>
      <div class="form-group"><label class="label">Type</label>
        <select class="select" name="qtype">${SURVEY_QUESTION_TYPES.map(t => `<option value="${t}" ${q.type === t ? 'selected' : ''}>${TYPE_LABEL[t]}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-group"><label class="label">Description</label><input class="input" name="qdesc" value="${esc(q.description || '')}"></div>
    <div class="form-group"><label class="label">Options (one per line, for choices/dropdown)</label><textarea class="textarea" name="qopts" rows="2">${esc(opts)}</textarea></div>
    <label><input type="checkbox" name="qreq" ${q.required ? 'checked' : ''}> Required</label>
    <div style="margin-top:8px;display:flex;gap:6px">
      <button type="button" class="btn btn-secondary btn-sm" onclick="Surveys.moveQ(${i},-1)">Up</button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="Surveys.moveQ(${i},1)">Down</button>
      <button type="button" class="btn btn-danger btn-sm" onclick="Surveys.removeQ(${i})">Remove</button>
    </div>
  </div>`;
}

export function renderSurveyBuilder(id) {
  const s = id ? getSurveyTemplate(id) : { name: '', description: '', startDate: todayISO(), endDate: '', questions: [], status: 'draft' };
  const qs = (s.questions || []).slice().sort((a, b) => a.order - b.order);
  return `<div class="card">
    <div class="card-title">${id ? 'Edit survey' : 'New survey'}</div>
    <form onsubmit="Surveys.saveTemplate(event,'${id || ''}')">
      <div class="form-group"><label class="label">Name</label><input class="input" name="name" value="${esc(s.name || '')}" required></div>
      <div class="form-group"><label class="label">Description</label><textarea class="textarea" name="description">${esc(s.description || '')}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Start</label><input class="input" type="date" name="startDate" value="${esc(s.startDate || '')}"></div>
        <div class="form-group"><label class="label">End</label><input class="input" type="date" name="endDate" value="${esc(s.endDate || '')}"></div>
        <div class="form-group"><label class="label">Status</label>
          <select class="select" name="status">
            ${['draft', 'active', 'closed', 'archived'].map(st => `<option value="${st}" ${s.status === st ? 'selected' : ''}>${st}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="surveyQs">${qs.map((q, i) => questionRow(q, i)).join('') || '<p class="mq-muted">No questions yet.</p>'}</div>
      <button type="button" class="btn btn-secondary" onclick="Surveys.addQ()">Add question</button>
      <button class="btn btn-primary" type="submit" style="margin-left:8px">Save</button>
    </form>
  </div>`;
}

function collectQuestions(form) {
  return [...form.querySelectorAll('[data-q]')].map((el, i) => ({
    id: el.dataset.q,
    label: el.querySelector('[name=qlabel]')?.value || `Question ${i + 1}`,
    description: el.querySelector('[name=qdesc]')?.value || '',
    type: el.querySelector('[name=qtype]')?.value || 'short_text',
    required: !!el.querySelector('[name=qreq]')?.checked,
    options: (el.querySelector('[name=qopts]')?.value || '').split('\n').map(x => x.trim()).filter(Boolean),
    order: i,
  }));
}

export function renderSurveyFill(surveyId, { visitId = '', outletId = '' } = {}) {
  const s = getSurveyTemplate(surveyId);
  if (!s) return `<div class="empty-state"><h3>Survey not found</h3></div>`;
  const products = getProducts().filter(p => p.status === 'active');
  const outlets = getOutlets();
  const draft = getSurveyResponses({ surveyId, employeeId: getActor()?.employeeId }).find(r => r.status === 'draft');
  const answers = draft?.answers || {};
  const field = q => {
    const v = answers[q.id] ?? '';
    const name = `a_${q.id}`;
    if (q.type === 'long_text') return `<textarea class="textarea" name="${name}">${esc(v)}</textarea>`;
    if (q.type === 'number' || q.type === 'currency' || q.type === 'rating') {
      return `<input class="input" type="number" name="${name}" value="${esc(v)}" ${q.type === 'rating' ? 'min="1" max="5"' : ''}>`;
    }
    if (q.type === 'yes_no') return `<select class="select" name="${name}"><option value="">Select</option><option value="yes" ${v === 'yes' ? 'selected' : ''}>Yes</option><option value="no" ${v === 'no' ? 'selected' : ''}>No</option></select>`;
    if (q.type === 'date') return `<input class="input" type="date" name="${name}" value="${esc(v)}">`;
    if (q.type === 'time') return `<input class="input" type="time" name="${name}" value="${esc(v)}">`;
    if (q.type === 'photo') return `<input class="input" type="file" accept="image/*" capture="environment" name="${name}">`;
    if (q.type === 'product') return `<select class="select" name="${name}"><option value="">Select product</option>${products.map(p => `<option value="${p.id}" ${v === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
    if (q.type === 'outlet') return `<select class="select" name="${name}"><option value="">Select outlet</option>${outlets.map(o => `<option value="${o.id}" ${v === o.id ? 'selected' : ''}>${esc(formatOutletLabel(o))}</option>`).join('')}</select>`;
    if (['single_choice', 'dropdown'].includes(q.type)) {
      return `<select class="select" name="${name}"><option value="">Select</option>${(q.options || []).map(o => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    }
    if (q.type === 'multiple_choice') {
      const picked = Array.isArray(v) ? v : [];
      return (q.options || []).map(o => `<label style="display:block"><input type="checkbox" name="${name}" value="${esc(o)}" ${picked.includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('');
    }
    return `<input class="input" name="${name}" value="${esc(v)}">`;
  };
  const qs = (s.questions || []).slice().sort((a, b) => a.order - b.order);
  return `<div class="card">
    <div class="card-title">${esc(s.name)}</div>
    <p class="mq-muted">${esc(s.description || '')}</p>
    <form onsubmit="Surveys.submit(event,'${s.id}','${esc(visitId)}','${esc(outletId)}')">
      ${qs.map(q => `<div class="form-group"><label class="label">${esc(q.label)}${q.required ? ' *' : ''}</label>
        ${q.description ? `<div class="mq-muted">${esc(q.description)}</div>` : ''}
        ${field(q)}</div>`).join('')}
      <button type="button" class="btn btn-secondary" onclick="Surveys.draft(event,'${s.id}','${esc(visitId)}','${esc(outletId)}')">Save draft</button>
      <button class="btn btn-primary" type="submit">Submit</button>
    </form>
  </div>`;
}

export function renderSurveyMonitor(id) {
  const m = surveyMonitoring(id);
  const emp = Object.fromEntries(getEmployees().map(e => [e.id, e.name]));
  const out = Object.fromEntries(getOutlets().map(o => [o.id, o.name]));
  return `<div class="card">
    <div class="card-title">${esc(m.survey.name)} — monitoring</div>
    <div class="grid-3" style="margin:12px 0">
      <div class="stat-card"><div class="stat-label">Assigned</div><div class="stat-value">${m.assigned}</div></div>
      <div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value">${m.completed}</div></div>
      <div class="stat-card"><div class="stat-label">Completion</div><div class="stat-value">${m.pct}%</div></div>
    </div>
    <div class="visits-table-wrapper"><table class="table">
      <thead><tr><th>Employee</th><th>Outlet</th><th>Status</th><th>Submitted</th></tr></thead>
      <tbody>${m.responses.length ? m.responses.map(r => `<tr>
        <td>${esc(emp[r.employeeId] || r.employeeId)}</td>
        <td>${esc(out[r.outletId] || r.outletId || '—')}</td>
        <td>${esc(r.status)}</td>
        <td>${esc(r.submittedAt ? r.submittedAt.slice(0, 16).replace('T', ' ') : '—')}</td>
      </tr>`).join('') : `<tr><td colspan="4"><div class="empty-state"><h3>No responses</h3></div></td></tr>`}</tbody>
    </table></div>
  </div>`;
}

function readAnswers(form, survey) {
  const answers = {};
  for (const q of survey.questions || []) {
    const name = `a_${q.id}`;
    if (q.type === 'multiple_choice') {
      answers[q.id] = [...form.querySelectorAll(`[name="${name}"]:checked`)].map(el => el.value);
    } else if (q.type === 'photo') {
      const file = form.querySelector(`[name="${name}"]`)?.files?.[0];
      answers[q.id] = file ? file.name : (form.querySelector(`[name="${name}"]`)?.value || '');
    } else {
      answers[q.id] = form.querySelector(`[name="${name}"]`)?.value || '';
    }
  }
  return answers;
}

window.Surveys = {
  openBuilder(id = '') {
    location.hash = id ? `#/surveys/edit/${id}` : '#/surveys/new';
  },
  addQ() {
    const wrap = document.getElementById('surveyQs');
    if (!wrap) return;
    const i = wrap.querySelectorAll('[data-q]').length;
    wrap.insertAdjacentHTML('beforeend', questionRow({ id: `Q${Date.now()}`, label: '', type: 'short_text', required: false, options: [], order: i }, i));
  },
  moveQ(i, dir) {
    const wrap = document.getElementById('surveyQs');
    const nodes = [...wrap.querySelectorAll('[data-q]')];
    const j = i + dir;
    if (j < 0 || j >= nodes.length) return;
    const a = nodes[i], b = nodes[j];
    if (dir < 0) wrap.insertBefore(a, b); else wrap.insertBefore(b, a);
  },
  removeQ(i) {
    document.getElementById('surveyQs')?.querySelectorAll('[data-q]')[i]?.remove();
  },
  saveTemplate(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'), description: fd.get('description'),
      startDate: fd.get('startDate'), endDate: fd.get('endDate'),
      status: fd.get('status'), questions: collectQuestions(e.target),
    };
    try {
      if (id) updateSurveyTemplate(id, payload);
      else createSurveyTemplate(payload);
      window.FT?.showToast?.('Survey saved', 'success') || alert('Survey saved');
      location.hash = '#/surveys';
    } catch (err) { window.FT?.showToast?.(err.message, 'error') || alert(err.message); }
  },
  openAssign(id) {
    const employees = getEmployees();
    const outlets = getOutlets();
    const html = `<form onsubmit="Surveys.saveAssign(event,'${id}')">
      <div class="form-group"><label class="label">Field sales</label>
        <select class="select" name="employeeId"><option value="">Entire project</option>${employees.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label class="label">Supervisor</label>
        <select class="select" name="supervisorId"><option value="">Any</option>${employees.filter(e => /supervisor/i.test(e.role || '')).map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label class="label">Outlet</label>
        <select class="select" name="outletId"><option value="">Any outlet</option>${outlets.map(o => `<option value="${o.id}">${esc(formatOutletLabel(o))}</option>`).join('')}</select></div>
      <button class="btn btn-primary" type="submit">Assign</button></form>`;
    window.FT?.openHtmlModal?.('Assign survey', html);
  },
  saveAssign(e, id) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      assignSurvey({ surveyId: id, ...data });
      window.FT?.showToast?.('Assigned', 'success');
      window.FT?.closeModal?.();
    } catch (err) { window.FT?.showToast?.(err.message, 'error') || alert(err.message); }
  },
  openMonitor(id) { location.hash = `#/surveys/monitor/${id}`; },
  openFill(id, visitId = '', outletId = '') { location.hash = `#/surveys/fill/${id}?v=${visitId}&o=${outletId}`; },
  draft(e, surveyId, visitId, outletId) {
    e.preventDefault();
    const form = e.target.closest('form');
    try {
      saveSurveyDraft({ surveyId, visitId, outletId, answers: readAnswers(form, getSurveyTemplate(surveyId)) });
      window.FT?.showToast?.('Draft saved', 'success');
    } catch (err) { window.FT?.showToast?.(err.message, 'error') || alert(err.message); }
  },
  submit(e, surveyId, visitId, outletId) {
    e.preventDefault();
    try {
      submitSurveyResponse({ surveyId, visitId, outletId, answers: readAnswers(e.target, getSurveyTemplate(surveyId)) });
      window.FT?.showToast?.('Survey submitted', 'success');
      location.hash = '#/mysurveys';
    } catch (err) { window.FT?.showToast?.(err.message, 'error') || alert(err.message); }
  },
};

void formatCurrency;
void getSurveyAssignments;
