// ProQTrack — Attendance + Leave local DB domain
// Dependency-injected to keep db.js as the public API / authority facade.

import { uid, sanitizePlainText, todayISO } from './utils.js';

export function createAttendanceLeaveDomain(deps) {
  const {
    getDB,
    saveDB,
    scoped,
    getActor,
    isOrgAdminRole,
    isProjectAdminRole,
    visibleEmployeeIds,
    canAccessEmployee,
    assertLoggedIn,
    assertCanAccessEmployee,
    getOrganization,
    getCurrentOrgId,
    withOrg,
    getProjectAttendancePolicy,
  } = deps;

  function getAttendancePoints() {
    const rows = scoped(getDB().attendancePoints || []);
    if (rows.length) return rows;
    const org = getOrganization();
    return [{
      id: 'APT-OFFICE',
      organizationId: getCurrentOrgId(),
      type: 'office',
      name: org?.name ? `Kantor ${org.name}` : 'Kantor',
      address: [org?.city, org?.province].filter(Boolean).join(', '),
      builtIn: true,
    }];
  }

  function createAttendancePoint(data) {
    const actor = assertLoggedIn();
    if (!isProjectAdminRole(actor.role) && actor.role !== 'supervisor') throw new Error('Akses ditolak');
    const point = {
      id: uid('APT'),
      type: ['office', 'meeting', 'store', 'point'].includes(data.type) ? data.type : 'point',
      name: sanitizePlainText(data.name),
      address: sanitizePlainText(data.address || ''),
      outletId: data.outletId || null,
      lat: data.lat === '' || data.lat == null ? null : Number(data.lat),
      lng: data.lng === '' || data.lng == null ? null : Number(data.lng),
      radiusM: data.radiusM === '' || data.radiusM == null ? null : Number(data.radiusM),
      ...withOrg(data),
      createdBy: actor.id,
    };
    if (!point.name) throw new Error('Nama titik absensi wajib diisi.');
    const db = getDB();
    db.attendancePoints = db.attendancePoints || [];
    db.attendancePoints.push(point);
    saveDB();
    return point;
  }

  function getAttendance() {
    const rows = scoped(getDB().attendance);
    const actor = getActor();
    if (!actor || isOrgAdminRole(actor.role)) return rows;
    const ids = visibleEmployeeIds(actor);
    return rows.filter(a => ids.has(a.employeeId));
  }

  function getAttendanceByDate(date) {
    return getAttendance().filter(a => a.date === date);
  }

  function getAttendanceByEmployee(empId) {
    if (!canAccessEmployee(empId)) return [];
    return getAttendance().filter(a => a.employeeId === empId);
  }

  function createAttendance(data) {
    const actor = assertLoggedIn();
    const employeeId = String(data.employeeId || '');
    const projectId = String(data.projectId || '');
    const date = String(data.workDate || data.date || todayISO()).slice(0,10);
    if (!employeeId || !projectId) throw new Error('Project dan karyawan absensi wajib tersedia.');
    assertCanAccessEmployee(employeeId);
    if (actor.role === 'employee' && String(actor.employeeId || '') !== employeeId) throw new Error('Akses ditolak');
    if (actor.role === 'employee' && date !== todayISO()) throw new Error('Absensi mandiri hanya dapat dilakukan untuk hari ini.');

    const db = getDB();
    const project = (db.projects || []).find(row => String(row.id) === projectId);
    if (!project || !['active','draft'].includes(String(project.status || ''))) throw new Error('Project attendance tidak aktif.');
    if ((project.startDate && date < String(project.startDate)) || (project.endDate && date > String(project.endDate))) {
      throw new Error('Tanggal absensi berada di luar periode project.');
    }
    const assignment = (db.projectAssignments || []).find(row =>
      String(row.employeeId) === employeeId
      && String(row.projectId) === projectId
      && ['active','assigned'].includes(String(row.status || 'active'))
      && (!row.startDate || String(row.startDate) <= date)
      && (!row.endDate || String(row.endDate) >= date)
    );
    if (!assignment) throw new Error('Karyawan tidak memiliki assignment aktif pada project ini.');
    const policy = getProjectAttendancePolicy(projectId);
    if (policy.sourceMode === 'visit') throw new Error('Absensi project ini dihitung otomatis dari kunjungan.');

    if ((db.leaves || []).some(row =>
      String(row.employeeId) === employeeId
      && String(row.status) === 'approved'
      && String(row.startDate || '') <= date
      && String(row.endDate || '') >= date
    )) throw new Error('Absensi tidak dapat dibuat karena terdapat ijin/cuti yang sudah disetujui.');

    if ((db.attendance || []).some(row =>
      String(row.employeeId) === employeeId
      && String(row.projectId) === projectId
      && String(row.date || row.workDate || '').slice(0,10) === date
    )) throw new Error('Absensi project ini untuk hari tersebut sudah tercatat.');

    const checkInAt = String(data.checkInAt || data.checkInTime || '').trim();
    const clock = (checkInAt.match(/(?:T|^)(\d{2}:\d{2})/) || [])[1] || '';
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock)) throw new Error('Waktu check-in tidak valid.');
    const status = clock >= policy.lateAfter ? 'terlambat' : 'hadir';
    const att = {
      ...withOrg(data),
      id:uid('ATT'),
      employeeId,
      projectId,
      date,
      workDate:date,
      checkInAt,
      checkInTime:clock,
      checkOutAt:null,
      checkOutTime:null,
      status,
      attendanceSource:'manual',
      createdBy:actor.id,
      createdAt:new Date().toISOString(),
    };
    db.attendance.push(att);
    saveDB();
    return att;
  }

  function updateAttendance(id, data) {
    const db = getDB();
    const idx = db.attendance.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Absensi tidak ditemukan.');
    const actor = assertLoggedIn();
    const current = db.attendance[idx];
    assertCanAccessEmployee(current.employeeId);

    const source = String(current.attendanceSource || 'manual') === 'visit' ? 'visit' : 'manual';
    const correctionReason = sanitizePlainText(data.correctionReason || '');
    const canCorrect = isOrgAdminRole(actor.role) || actor.role === 'manager' || actor.role === 'supervisor';

    for (const key of ['employeeId','projectId','date','workDate']) {
      if (data[key] !== undefined && String(data[key]) !== String(current[key] || '')) {
        throw new Error('Identitas absensi tidak dapat diubah.');
      }
    }

    if (correctionReason) {
      if (!canCorrect) throw new Error('Akses koreksi absensi ditolak.');
      if (source === 'visit') throw new Error('Absensi turunan Visit harus dikoreksi dari workflow Visit.');
      if (correctionReason.length < 10) throw new Error('Alasan koreksi wajib minimal 10 karakter.');
      const nextStatus = String(data.status || current.status || '').toLowerCase();
      const allowed = new Set(['present','late','absent','hadir','terlambat','tidak hadir']);
      if (!allowed.has(nextStatus)) throw new Error('Status koreksi absensi tidak valid.');

      const checkInAt = String(data.checkInAt ?? data.checkInTime ?? current.checkInAt ?? current.checkInTime ?? '').trim();
      const checkOutAt = String(data.checkOutAt ?? data.checkOutTime ?? current.checkOutAt ?? current.checkOutTime ?? '').trim();
      const inClock = (checkInAt.match(/(?:T|^)(\d{2}:\d{2})/) || [])[1] || '';
      const outClock = (checkOutAt.match(/(?:T|^)(\d{2}:\d{2})/) || [])[1] || '';
      const absent = ['absent','tidak hadir'].includes(nextStatus);
      if (!absent && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(inClock)) throw new Error('Waktu check-in koreksi tidak valid.');
      if (checkOutAt && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(outClock)) throw new Error('Waktu check-out koreksi tidak valid.');
      if (inClock && outClock && outClock < inClock) throw new Error('Check-out tidak boleh lebih awal dari check-in.');

      db.attendance[idx] = {
        ...current,
        ...data,
        checkInAt:checkInAt || null,
        checkInTime:inClock || null,
        checkOutAt:checkOutAt || null,
        checkOutTime:outClock || null,
        correctionReason,
        correctionPrevious:{
          status:current.status,
          checkInAt:current.checkInAt || current.checkInTime || null,
          checkOutAt:current.checkOutAt || current.checkOutTime || null,
          correctedAt:current.correctedAt || null,
        },
        correctionCount:Math.max(0,Number(current.correctionCount)||0)+1,
        correctedBy:actor.id,
        correctedAt:new Date().toISOString(),
      };
      saveDB();
      return db.attendance[idx];
    }

    if (source === 'visit') throw new Error('Absensi turunan Visit bersifat read-only.');
    if (actor.role === 'employee' && String(actor.employeeId || '') !== String(current.employeeId)) throw new Error('Akses ditolak.');
    if (actor.role === 'employee' && String(current.date || current.workDate || '') !== todayISO()) {
      throw new Error('Check-out mandiri hanya dapat dilakukan pada hari yang sama.');
    }
    for (const key of ['status','checkInAt','checkInTime','lat','lng','checkInLatitude','checkInLongitude']) {
      if (data[key] !== undefined && current[key] !== undefined && String(data[key]) !== String(current[key])) {
        throw new Error('Absensi tercatat tidak dapat dikoreksi langsung. Gunakan workflow koreksi.');
      }
    }
    const existingCheckout = String(current.checkOutAt || current.checkOutTime || '').trim();
    const requestedCheckout = String(data.checkOutAt || data.checkOutTime || '').trim();
    if (existingCheckout) {
      if (requestedCheckout && requestedCheckout !== existingCheckout) throw new Error('Check-out yang sudah tercatat tidak dapat diubah.');
      return current;
    }
    if (!requestedCheckout) return current;
    const inClock = (String(current.checkInAt || current.checkInTime || '').match(/(?:T|^)(\d{2}:\d{2})/) || [])[1] || '';
    const outClock = (requestedCheckout.match(/(?:T|^)(\d{2}:\d{2})/) || [])[1] || '';
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(outClock)) throw new Error('Waktu check-out tidak valid.');
    if (inClock && outClock < inClock) throw new Error('Check-out tidak boleh lebih awal dari check-in.');

    db.attendance[idx] = {
      ...current,
      ...data,
      checkOutAt:requestedCheckout,
      checkOutTime:outClock,
      checkedOutBy:actor.id,
      checkedOutAt:new Date().toISOString(),
    };
    saveDB();
    return db.attendance[idx];
  }

  function checkOutAttendance(id, checkOutAt) {
    return updateAttendance(id, { checkOutAt, checkOutTime:checkOutAt });
  }

  function correctAttendance(id, data = {}) {
    return updateAttendance(id, data);
  }

  function getLeaves() {
    const db = getDB();
    const employeeIds = new Set(scoped(db.employees).map(row => row.id));
    const rows = scoped(db.leaves).filter(row => employeeIds.has(row.employeeId));
    const actor = getActor();
    if (!actor || isOrgAdminRole(actor.role)) return rows;
    const ids = visibleEmployeeIds(actor);
    return rows.filter(l => ids.has(l.employeeId));
  }

  function getLeavesByEmployee(empId) {
    if (!canAccessEmployee(empId)) return [];
    return getLeaves().filter(l => l.employeeId === empId);
  }

  function getLeaveTypes() {
    return getDB().leaveTypes;
  }

  function createLeave(data) {
    const actor = assertLoggedIn();
    const employeeId = String(data.employeeId || '');
    assertCanAccessEmployee(employeeId);
    if (actor.role === 'employee' && employeeId !== String(actor.employeeId || '')) throw new Error('Akses ditolak');
    const type = sanitizePlainText(data.type || '');
    const reason = sanitizePlainText(data.reason || '');
    const startDate = String(data.startDate || '');
    const endDate = String(data.endDate || '');
    if (!type) throw new Error('Tipe ijin/cuti wajib diisi.');
    if (reason.length < 5) throw new Error('Alasan ijin/cuti wajib diisi minimal 5 karakter.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
      throw new Error('Periode ijin/cuti tidak valid.');
    }
    if (actor.role === 'employee' && endDate < todayISO()) throw new Error('Pengajuan ijin/cuti yang seluruh periodenya sudah lewat tidak dapat dibuat.');
    const db = getDB();
    const conflict = (db.leaves || []).some(row =>
      String(row.employeeId) === employeeId
      && ['pending','approved'].includes(String(row.status || ''))
      && !(String(row.endDate || '') < startDate || String(row.startDate || '') > endDate)
    );
    if (conflict) throw new Error('Periode ijin/cuti bertabrakan dengan pengajuan lain.');
    const days = Math.floor((Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000) + 1;
    const leave = {
      ...withOrg(data),
      id:uid('LV'),
      employeeId,
      type,
      reason,
      startDate,
      endDate,
      days,
      status:'pending',
      submittedAt:todayISO(),
      approverId:null,
      approvedAt:null,
      submittedBy:actor.id,
      decisionKind:null,
      decisionNote:null,
    };
    db.leaves.push(leave);
    saveDB();
    return leave;
  }

  function updateLeave(id, data) {
    const db = getDB();
    const idx = db.leaves.findIndex(l => l.id === id);
    if (idx === -1) throw new Error('Pengajuan ijin/cuti tidak ditemukan.');
    const actor = assertLoggedIn();
    const current = db.leaves[idx];
    assertCanAccessEmployee(current.employeeId);
    if (['approved','rejected'].includes(String(current.status || ''))) {
      throw new Error('Pengajuan cuti final tidak dapat diubah.');
    }

    const nextStatus = String(data.status || current.status || 'pending');
    if (actor.role === 'employee') {
      if (String(actor.employeeId || '') !== String(current.employeeId)) throw new Error('Akses ditolak.');
      if (nextStatus === 'rejected' && String(data.decisionKind || '') === 'withdrawn') {
        db.leaves[idx] = {
          ...current,
          status:'rejected',
          approverId:null,
          approvedAt:null,
          decisionKind:'withdrawn',
          decisionNote:sanitizePlainText(data.decisionNote || 'Dibatalkan oleh pengaju'),
          withdrawnBy:actor.id,
          withdrawnAt:new Date().toISOString(),
        };
        saveDB();
        return db.leaves[idx];
      }
      if (nextStatus !== 'pending') throw new Error('Akses ditolak.');
      if (String(current.startDate || '') <= todayISO()) throw new Error('Pengajuan yang sudah mulai tidak dapat diedit.');
      const type = sanitizePlainText(data.type ?? current.type ?? '');
      const reason = sanitizePlainText(data.reason ?? current.reason ?? '');
      const startDate = String(data.startDate ?? current.startDate ?? '');
      const endDate = String(data.endDate ?? current.endDate ?? '');
      if (!type) throw new Error('Tipe ijin/cuti wajib diisi.');
      if (reason.length < 5) throw new Error('Alasan ijin/cuti wajib diisi minimal 5 karakter.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) throw new Error('Periode ijin/cuti tidak valid.');
      const conflict = (db.leaves || []).some(row =>
        row.id !== id
        && String(row.employeeId) === String(current.employeeId)
        && ['pending','approved'].includes(String(row.status || ''))
        && !(String(row.endDate || '') < startDate || String(row.startDate || '') > endDate)
      );
      if (conflict) throw new Error('Periode ijin/cuti bertabrakan dengan pengajuan lain.');
      const days = Math.floor((Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000) + 1;
      db.leaves[idx] = { ...current, type, reason, startDate, endDate, days };
      saveDB();
      return db.leaves[idx];
    }

    if (!(isProjectAdminRole(actor.role) || actor.role === 'supervisor')) throw new Error('Akses ditolak.');
    if (actor.employeeId && String(actor.employeeId) === String(current.employeeId)) throw new Error('Pengajuan tidak boleh direview oleh pengaju sendiri.');
    if (!['approved','rejected'].includes(nextStatus)) throw new Error('Keputusan approval tidak valid.');
    const decisionNote = sanitizePlainText(data.decisionNote || '');
    if (nextStatus === 'rejected' && decisionNote.length < 5) throw new Error('Alasan penolakan wajib minimal 5 karakter.');
    if (nextStatus === 'approved') {
      const attendanceConflict = (db.attendance || []).find(row =>
        String(row.employeeId) === String(current.employeeId)
        && String(row.date || row.workDate || '') >= String(current.startDate || '')
        && String(row.date || row.workDate || '') <= String(current.endDate || '')
        && ['hadir','terlambat','present','late'].includes(String(row.status || '').toLowerCase())
      );
      if (attendanceConflict) throw new Error('Pengajuan tidak dapat disetujui karena sudah ada attendance pada periode tersebut.');
    }
    db.leaves[idx] = {
      ...current,
      status:nextStatus,
      approverId:actor.id,
      approvedAt:new Date().toISOString(),
      decisionKind:nextStatus,
      decisionNote,
    };
    saveDB();
    return db.leaves[idx];
  }

  function withdrawLeave(id, note = '') {
    return updateLeave(id, { status:'rejected', decisionKind:'withdrawn', decisionNote:note });
  }

  function deleteLeave() {
    assertLoggedIn();
    throw new Error('Pengajuan ijin/cuti tidak dapat dihapus. Gunakan withdrawal atau keputusan approval agar audit trail tetap utuh.');
  }

  return {
    getAttendancePoints,
    createAttendancePoint,
    getAttendance,
    getAttendanceByDate,
    getAttendanceByEmployee,
    createAttendance,
    updateAttendance,
    checkOutAttendance,
    correctAttendance,
    getLeaves,
    getLeavesByEmployee,
    getLeaveTypes,
    createLeave,
    updateLeave,
    withdrawLeave,
    deleteLeave,
  };
}
