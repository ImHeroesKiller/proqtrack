import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateAttendanceMutation,
  validateLeaveMutation,
  visitAttendanceStatements,
  operationalTransitionAllowed,
} from '../worker/operations.js';

function validateTransition(role, entity, change, existing) {
  return operationalTransitionAllowed({role},entity,change,{existing});
}

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const field = readFileSync(new URL('../src/field-sales.js', import.meta.url), 'utf8');
const pm = readFileSync(new URL('../src/types/index.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0028_attendance_leave_project_authority.sql', import.meta.url), 'utf8');

function attendanceEnv({source='manual', assignment=true, duplicate=false, targetUserId='USR-EMP', target={latitude:-6.2,longitude:106.8,radius_m:150,status:'active'}}={}) {
  return {
    DB:{
      prepare(sql){
        return {
          bind(...args){
            return {
              async first(){
                if (/FROM core_projects/.test(sql)) return {id:'PRJ-1',status:'active',metadata_json:JSON.stringify({attendanceSource:source,modules:{attendance:true,leaves:true}})};
                if (/FROM core_employee_project_assignments/.test(sql)) return assignment ? {id:'ASN-1'} : null;
                if (/FROM core_attendance WHERE/.test(sql)) return duplicate ? {id:'ATT-OLD'} : null;
                if (/FROM core_employees/.test(sql)) return {auth_user_id:targetUserId};
                if (/FROM core_outlets/.test(sql) || /FROM core_attendance_points/.test(sql)) return target;
                return null;
              }
            };
          }
        };
      }
    }
  };
}

function leaveEnv({assignment=true, overlap=false, modules={attendance:true,leaves:true}}={}) {
  return {
    DB:{
      prepare(sql){
        return {
          bind(...args){
            return {
              async first(){
                if (/FROM core_projects/.test(sql)) return {id:'PRJ-1',metadata_json:JSON.stringify({modules})};
                if (/FROM core_employee_project_assignments/.test(sql)) return assignment ? {id:'ASN-1'} : null;
                if (/FROM core_leaves/.test(sql)) return overlap ? {id:'LV-OLD'} : null;
                return null;
              }
            };
          }
        };
      }
    }
  };
}

test('P0 project editor exposes manual or visit attendance source', () => {
  assert.match(pm,/name="attendanceSource"/);
  assert.match(pm,/value="manual"/);
  assert.match(pm,/value="visit"/);
  assert.match(pm,/attendanceSource: formValue\(fd, "attendanceSource"\) === "visit" \? "visit" : "manual"/);
});

test('P0 manual attendance requires project assignment and canonical status', async () => {
  const row={
    id:'ATT-1',projectId:'PRJ-1',employeeId:'EMP-1',workDate:'2026-09-25',
    status:'terlambat',lat:-6.2,lng:106.8,locationType:'point',locationId:'APT-1'
  };
  const result=await validateAttendanceMutation(attendanceEnv(), 'ORG-1', {role:'employee',sub:'USR-EMP'}, row, null, 'upsert');
  assert.equal(result,null);
  assert.equal(row.status,'late');
  assert.equal(row.source,'manual');
  assert.equal(row.geofenceStatus,'valid');
});

test('P0 manual attendance is blocked for visit-derived projects', async () => {
  const row={id:'ATT-1',projectId:'PRJ-1',employeeId:'EMP-1',workDate:'2026-09-25',status:'present',lat:-6.2,lng:106.8,locationType:'point',locationId:'APT-1'};
  const result=await validateAttendanceMutation(attendanceEnv({source:'visit'}),'ORG-1',{role:'employee',sub:'USR-EMP'},row,null,'upsert');
  assert.equal(result?.error,'ATTENDANCE_MANUAL_DISABLED');
});

test('P0 manual attendance requires GPS and rejects duplicate project-day record', async () => {
  const noGps=await validateAttendanceMutation(attendanceEnv(),'ORG-1',{role:'employee',sub:'USR-EMP'},{
    id:'ATT-1',projectId:'PRJ-1',employeeId:'EMP-1',workDate:'2026-09-25',status:'present',locationType:'point',locationId:'APT-1'
  },null,'upsert');
  assert.equal(noGps?.error,'ATTENDANCE_GPS_REQUIRED');

  const dup=await validateAttendanceMutation(attendanceEnv({duplicate:true}),'ORG-1',{role:'employee',sub:'USR-EMP'},{
    id:'ATT-2',projectId:'PRJ-1',employeeId:'EMP-1',workDate:'2026-09-25',status:'present',lat:-6.2,lng:106.8,locationType:'point',locationId:'APT-1'
  },null,'upsert');
  assert.equal(dup?.error,'ATTENDANCE_ALREADY_RECORDED');
});

test('P0 visit attendance statement atomically upserts one project-day attendance', () => {
  const captured=[];
  const env={DB:{prepare(sql){return{bind(...args){captured.push({sql,args}); return {sql,args};}}}}};
  const rows=visitAttendanceStatements(env,'ORG-1',{
    id:'VIS-1',projectId:'PRJ-1',employeeId:'EMP-1',status:'checked-in',
    checkInCapturedAt:'2026-09-25T01:00:00.000Z',checkInLat:-6.2,checkInLng:106.8
  },{id:'VIS-1',project_id:'PRJ-1',employee_id:'EMP-1',status:'planned',scheduled_at:'2026-09-25'},'visit');
  assert.equal(rows.length,1);
  assert.match(captured[0].sql,/INSERT INTO core_attendance/);
  assert.match(captured[0].sql,/ON CONFLICT\(organization_id,project_id,employee_id,work_date\)/);
  assert.ok(captured[0].args.includes('visit-attendance:PRJ-1:EMP-1:2026-09-25'));
});

test('P0 leave authority requires project and authoritative date-derived duration', async () => {
  const row={id:'LV-1',projectId:'PRJ-1',employeeId:'EMP-1',type:'Cuti Tahunan',startDate:'2026-09-25',endDate:'2026-09-27',days:99,reason:'Keperluan keluarga',status:'pending'};
  const result=await validateLeaveMutation(leaveEnv(),'ORG-1',row,null,'upsert');
  assert.equal(result,null);
  assert.equal(row.days,3);
});

test('P0 leave rejects invalid assignment, overlap, and disabled module', async () => {
  const base={id:'LV-1',projectId:'PRJ-1',employeeId:'EMP-1',type:'Cuti Tahunan',startDate:'2026-09-25',endDate:'2026-09-26',reason:'Keperluan keluarga',status:'pending'};
  assert.equal((await validateLeaveMutation(leaveEnv({assignment:false}),'ORG-1',{...base},null,'upsert'))?.error,'LEAVE_ASSIGNMENT_REQUIRED');
  assert.equal((await validateLeaveMutation(leaveEnv({overlap:true}),'ORG-1',{...base},null,'upsert'))?.error,'LEAVE_PERIOD_OVERLAP');
  assert.equal((await validateLeaveMutation(leaveEnv({modules:{attendance:true,leaves:false}}),'ORG-1',{...base},null,'upsert'))?.error,'LEAVE_MODULE_DISABLED');
});

test('P0 leave migration adds project scope without dropping legacy records', () => {
  assert.match(migration,/ALTER TABLE core_leaves ADD COLUMN project_id TEXT/);
  assert.match(migration,/UPDATE core_leaves\s+SET project_id/s);
  assert.match(migration,/idx_core_leaves_project_scope/);
});

test('P0 employee UI captures GPS for manual attendance and uses project-scoped leave', () => {
  assert.match(field,/captureDevicePosition\(\)/);
  assert.match(field,/projectId/);
  assert.match(field,/ATTENDANCE_MANUAL_DISABLED/);
  assert.match(app,/getLeaveProjectsForEmployee/);
  assert.match(app,/name="projectId"/);
  assert.match(app,/await confirmAuthoritativeSync\(\)/);
});

test('P0 stored leave output is escaped', () => {
  assert.match(app,/esc\(l\.type\)/);
  assert.match(app,/esc\(l\.reason\)/);
});

test('P0 worker stores leave project scope and decodes it back to clients', () => {
  assert.match(worker,/INSERT INTO core_leaves\(id,organization_id,project_id,employee_id/);
  assert.match(worker,/case 'leaves': return \{ \.\.\.common, projectId: dbRow\.project_id/);
});


test('P0 supervisors cannot redefine attendance geofence points', () => {
  assert.match(db,/if \(!isProjectAdminRole\(actor\.role\)\) throw new Error\('Akses ditolak'\)/);
  assert.match(worker,/if \(role === 'supervisor' && entity === 'attendancePoints'\) return false/);
});

test('P0 cloud bootstrap isolates leaves by both project and employee', () => {
  assert.match(worker,/data\.leaves = data\.leaves\.filter\(row => allowedProjects\.has\(str\(row\.projectId\)\) && employeesAllowed\.has\(str\(row\.employeeId\)\)\)/);
});

test('P0 visit checkout keeps attendance on original visit start day', () => {
  assert.match(worker,/isCheckOut\s*\? \(existing\.started_at/);
});


test('P0 attendance records are immutable after first authoritative write', () => {
  const existing={id:'ATT-1',project_id:'PRJ-1',employee_id:'EMP-1',work_date:'2026-09-25',status:'present'};
  assert.equal(validateTransition('manager','attendance',{row:{...existing,status:'late'}},existing),false);
  assert.equal(validateTransition('employee','attendance',{row:{...existing,checkInAt:'2026-09-25T09:00:00Z'}},existing),false);
});

test('P0 leave pending identity and period fields are immutable while approval status may advance', () => {
  const existing={
    id:'LV-1',project_id:'PRJ-1',employee_id:'EMP-1',start_date:'2026-09-25',end_date:'2026-09-26',
    type:'Cuti Tahunan',reason:'Keperluan keluarga',days:2,status:'pending',submitted_at:'2026-09-24'
  };
  assert.equal(validateTransition('supervisor','leaves',{row:{id:'LV-1',projectId:'PRJ-2',status:'approved'}},existing),false);
  assert.equal(validateTransition('supervisor','leaves',{row:{id:'LV-1',startDate:'2026-09-27',status:'approved'}},existing),false);
  assert.equal(validateTransition('supervisor','leaves',{row:{id:'LV-1',status:'approved'}},existing),true);
  assert.equal(validateTransition('employee','leaves',{row:{id:'LV-1',status:'approved'}},existing),false);
});

test('P0 leave assignment must cover the entire requested period', async () => {
  const calls=[];
  const env={DB:{prepare(sql){return{bind(...args){calls.push({sql,args});return{async first(){
    if (/FROM core_projects/.test(sql)) return {id:'PRJ-1',metadata_json:'{}'};
    if (/FROM core_employee_project_assignments/.test(sql)) return null;
    if (/FROM core_leaves/.test(sql)) return null;
    return null;
  }};}};}}};
  const row={id:'LV-2',projectId:'PRJ-1',employeeId:'EMP-1',type:'Cuti Tahunan',startDate:'2026-09-25',endDate:'2026-09-30',reason:'Keperluan keluarga',status:'pending'};
  const result=await validateLeaveMutation(env,'ORG-1',row,null,'upsert');
  assert.equal(result?.error,'LEAVE_ASSIGNMENT_REQUIRED');
  const assignmentCall=calls.find(x=>/FROM core_employee_project_assignments/.test(x.sql));
  assert.ok(assignmentCall);
  assert.equal(assignmentCall.args.at(-1),'2026-09-30');
});

test('P0 leave backfill accepts historical ended assignment only when it covers full leave period', () => {
  assert.match(migration,/a\.status IN \('active','inactive','ended'\)/);
  assert.match(migration,/date\(a\.ends_on\) >= date\(core_leaves\.end_date\)/);
});


test('P0 manual attendance is self-service for project roles', async () => {
  const row={id:'ATT-SPOOF',projectId:'PRJ-1',employeeId:'EMP-1',workDate:'2026-09-25',status:'present',lat:-6.2,lng:106.8,locationType:'point',locationId:'APT-1'};
  const result=await validateAttendanceMutation(attendanceEnv({targetUserId:'USR-EMP'}),'ORG-1',{role:'supervisor',sub:'USR-SPV'},row,null,'upsert');
  assert.equal(result?.error,'ATTENDANCE_SELF_ONLY');

  const own={...row,id:'ATT-OWN'};
  const ownResult=await validateAttendanceMutation(attendanceEnv({targetUserId:'USR-SPV'}),'ORG-1',{role:'supervisor',sub:'USR-SPV'},own,null,'upsert');
  assert.equal(ownResult,null);
});
