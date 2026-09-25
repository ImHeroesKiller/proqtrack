/**
 * ProQTrack Project Management v7
 * Native extension for the existing vanilla ES-module/hash-router application.
 * Keeps backward compatibility with proqtrack_db_v6 while mirroring v7.
 */

import { getDB, saveDB, getCurrentOrgId, getActor, DEFAULT_ORG_ID } from "../lib/db.js";
import { commitOperationalChanges, cloudDataStatus } from "../lib/cloud-data.js";
import { CLIENT_PAGE_SIZE, clientStatusLabel, normalizeClientWebsite, clientSyncState, clientMatchesFilters, paginateClients, normalizeAdditionalPics, clientSearchDocument } from "../lib/client-ui.js";
import { PROJECT_PAGE_SIZE, projectStatusLabel, projectSyncState, managerProjectIds, projectManagerNames, projectSupervisorNames, projectDependencies, projectSearchDocument, projectMatchesFilters, paginateProjects, closingProjectAssignments } from "../lib/project-ui.js";
import { ASSIGNMENT_PAGE_SIZE, assignmentRoleLabel, assignmentStatusLabel, normalizeAssignmentStatus, assignmentSyncState, employeeCapacityUsage, assignmentSearchDocument, assignmentMatchesFilters, paginateAssignments, eligibleSupervisors, eligibleAssignmentEmployees } from "../lib/assignment-ui.js";
import { subordinateEmployeeIds, teamMemberSummary, teamMatchesFilters, supervisorMetrics } from "../lib/team-employee-ui.js";

const ALL_MODULES = [
  "visits",
  "stocks",
  "prices",
  "competitorIntel",
  "photos",
  "attendance",
  "leaves",
  "newOutlet",
  "productSales",
];
const MODULE_LABELS = {
  visits: "Visits",
  stocks: "Outlet Stock",
  prices: "Price & Discount",
  competitorIntel: "Competitor Intel",
  photos: "Field Photos",
  attendance: "Attendance",
  leaves: "Leave",
  newOutlet: "New Outlet",
  productSales: "Product Sales",
};
const PROJECT_ROUTES = new Set([
  "#/clients",
  "#/projects",
  "#/assignments",
  "#/my-projects",
  "#/my-team",
  "#/supervisor-compare",
]);

const iconPaths = {
  clients:
    '<path d="M3 21V7l9-4 9 4v14"/><path d="M9 21v-6h6v6M7 10h2m6 0h2M7 13h2m6 0h2"/>',
  projects:
    '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18"/>',
  team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  compare: '<path d="M4 19V9m6 10V5m6 14v-7m6 7H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  unlink: '<path d="m18 13 3 3-3 3M21 16h-7"/>',
  filter: '<path d="M3 5h18M6 12h12M10 19h4"/>',
};
const svg = (name, cls = "") =>
  `<span class="phase0-icon ${cls}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || iconPaths.projects}</svg></span>`;
const esc = (v = "") =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );
const uid = (prefix) =>
  `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const now = () => new Date().toISOString();
const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "-";
const money = (value) =>
  value
    ? new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(Number(value))
    : "-";

function readDB() {
  return getDB();
}
function currentOrgId() {
  return getCurrentOrgId();
}
function orgRows(list) {
  const orgId = currentOrgId();
  return (list || []).filter((row) => row && row.organizationId === orgId);
}
function mergeOrgRows(all, next) {
  const orgId = currentOrgId();
  const nextIds = new Set((next || []).map((row) => row?.id).filter(Boolean));
  const others = (all || []).filter((row) => {
    if (!row) return false;
    if (!row.organizationId) return !nextIds.has(row.id);
    return row.organizationId !== orgId;
  });
  const keptUnstamped = others.filter((row) => !row.organizationId);
  const otherOrgs = others.filter((row) => row.organizationId);
  return [
    ...otherOrgs,
    ...keptUnstamped.map((row) => ({ ...row, organizationId: orgId })),
    ...(next || []).map((row) => ({ ...row, organizationId: row.organizationId || orgId })),
  ];
}
function viewDB() {
  const db = readDB();
  return {
    ...db,
    clients: orgRows(db.clients),
    projects: orgRows(db.projects),
    projectAssignments: orgRows(db.projectAssignments),
    employees: orgRows(db.employees),
    accounts: orgRows(db.accounts).map((row) => {
      const { password, ...safe } = row || {};
      return safe;
    }),
  };
}
function persistView(view) {
  const raw = readDB();
  raw.clients = mergeOrgRows(raw.clients, view.clients || []);
  raw.projects = mergeOrgRows(raw.projects, view.projects || []);
  raw.projectAssignments = mergeOrgRows(raw.projectAssignments, view.projectAssignments || []);
  // projectSettings is keyed by projectId (not org-sliced). viewDB returns the full
  // array, so a wholesale replace matches today's callers. Do not org-filter it
  // here unless viewDB starts slicing it the same way.
  raw.projectSettings = view.projectSettings ?? raw.projectSettings;
  writeDB(raw);
}
function writeDB(db) {
  if (db && db !== getDB()) {
    Object.assign(getDB(), db);
  }
  saveDB();
}
function defaultModules() {
  return Object.fromEntries(ALL_MODULES.map((k) => [k, true]));
}
function migrateV7() {
  const db = readDB();
  const stamp = now();
  let changed = false;
  const ensureArray = (key) => {
    if (!Array.isArray(db[key])) {
      db[key] = [];
      changed = true;
    }
  };
  ensureArray("employees");
  ensureArray("accounts");
  ensureArray("clients");
  ensureArray("projects");
  ensureArray("projectAssignments");
  ensureArray("projectSettings");
  const allowLegacyDemoSeed = typeof location === "undefined"
    || ["localhost", "127.0.0.1"].includes(location.hostname)
    || new URLSearchParams(location.search).has("demoSeed");
  if (allowLegacyDemoSeed && !db.clients.length) {
    changed = true;
    db.clients = [
      {
        id: "CL001",
        name: "Nusantara Distribusi Prima",
        legalName: "PT Nusantara Distribusi Prima",
        industry: "FMCG",
        npwp: "01.234.567.8-091.000",
        address: "Jl. Daan Mogot KM 12",
        city: "Jakarta Barat",
        province: "DKI Jakarta",
        website: "https://nusantaradistribusi.example",
        notes: "Distributor FMCG area Jabodetabek.",
        status: "active",
        picName: "Rina Mahardika",
        picRole: "National Sales Manager",
        picPhone: "0812-9000-1101",
        picEmail: "rina@nusantaradistribusi.example",
        additionalPics: [
          {
            name: "Dimas Prasetyo",
            role: "Trade Marketing",
            phone: "0812-9000-1102",
            email: "dimas@nusantaradistribusi.example",
          },
        ],
        cooperationStart: "2026-01-01",
        cooperationEnd: "2026-12-31",
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "CL002",
        name: "Apotek Sehat Sentosa",
        legalName: "PT Sehat Sentosa Farma",
        industry: "Farmasi",
        address: "Jl. TB Simatupang No. 88",
        city: "Jakarta Selatan",
        province: "DKI Jakarta",
        website: "https://sehat-sentosa.example",
        notes: "Jaringan apotek dan klinik.",
        status: "active",
        picName: "dr. Maya Putri",
        picRole: "Commercial Director",
        picPhone: "0813-8000-2201",
        picEmail: "maya@sehat-sentosa.example",
        additionalPics: [],
        cooperationStart: "2026-02-01",
        cooperationEnd: "2027-01-31",
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "CL003",
        name: "Mitra Bangunan Indonesia",
        legalName: "PT Mitra Bangunan Indonesia",
        industry: "Bangunan",
        address: "Jl. Raya Bekasi No. 141",
        city: "Bekasi",
        province: "Jawa Barat",
        website: "",
        notes: "Distribusi semen, cat, dan material bangunan.",
        status: "active",
        picName: "Hendra Gunawan",
        picRole: "Channel Development Head",
        picPhone: "0811-7000-3301",
        picEmail: "hendra@mitrabangunan.example",
        additionalPics: [
          {
            name: "Siska Amelia",
            role: "Procurement",
            phone: "0811-7000-3302",
            email: "siska@mitrabangunan.example",
          },
        ],
        cooperationStart: "2026-03-01",
        cooperationEnd: "2026-11-30",
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "CL004",
        name: "Rasa Nusantara Group",
        legalName: "PT Rasa Nusantara Boga",
        industry: "F&B",
        address: "Jl. Margonda Raya No. 55",
        city: "Depok",
        province: "Jawa Barat",
        website: "",
        notes: "Prospect aktivasi kanal horeca.",
        status: "prospect",
        picName: "Andre Wijaya",
        picRole: "Business Development",
        picPhone: "0812-6000-4401",
        picEmail: "andre@rasanusantara.example",
        additionalPics: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "CL005",
        name: "Prima Retail Network",
        legalName: "PT Prima Retail Network",
        industry: "Retail",
        address: "Alam Sutera, Serpong",
        city: "Tangerang Selatan",
        province: "Banten",
        website: "",
        notes: "Jaringan minimarket independen.",
        status: "inactive",
        picName: "Nadia Kusuma",
        picRole: "Operations Manager",
        picPhone: "0812-5000-5501",
        picEmail: "nadia@primaretail.example",
        additionalPics: [],
        cooperationStart: "2025-01-01",
        cooperationEnd: "2025-12-31",
        createdAt: stamp,
        updatedAt: stamp,
      },
    ];
  }
  if (!db.projects.length) {
    changed = true;
    db.projects = [
      {
        id: "PRJ001",
        clientId: "CL001",
        name: "Retail Execution Jabodetabek",
        code: "NDP-REJ-26",
        description:
          "Eksekusi kunjungan outlet, cek stok, harga, display, promo, dan dokumentasi kompetitor di kanal GT dan MT.",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "active",
        contractValue: 1850000000,
        targetVisits: 4200,
        targetOutlets: 650,
        region: "Jakarta, Bogor, Depok, Tangerang, Bekasi",
        notes: "Prioritas outlet tier A dan B.",
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "PRJ002",
        clientId: "CL001",
        name: "Strategic Promo Intelligence",
        code: "NDP-SPI-26",
        description:
          "Monitoring promo kompetitor strategis dan gap harga pada outlet prioritas.",
        startDate: "2026-04-01",
        endDate: "2026-09-30",
        status: "active",
        contractValue: 625000000,
        targetVisits: 1200,
        targetOutlets: 220,
        region: "DKI Jakarta dan Tangerang",
        notes: "Weekly executive summary.",
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "PRJ003",
        clientId: "CL002",
        name: "Pharmacy Availability Audit",
        code: "ASS-PAA-26",
        description:
          "Audit ketersediaan produk, planogram, harga, dan foto rak di jaringan apotek.",
        startDate: "2026-02-01",
        endDate: "2027-01-31",
        status: "active",
        contractValue: 1320000000,
        targetVisits: 3000,
        targetOutlets: 420,
        region: "Jabodetabek",
        notes: "Foto rak wajib.",
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "PRJ004",
        clientId: "CL003",
        name: "Building Material Coverage",
        code: "MBI-BMC-26",
        description:
          "Coverage toko bangunan, validasi stok dan harga material serta aktivitas kompetitor.",
        startDate: "2026-03-01",
        endDate: "2026-11-30",
        status: "on_hold",
        contractValue: 910000000,
        targetVisits: 1800,
        targetOutlets: 300,
        region: "Bekasi, Karawang, Jakarta Timur",
        notes: "On hold menunggu revisi area.",
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "PRJ005",
        clientId: "CL004",
        name: "Horeca Activation Pilot",
        code: "RNG-HAP-26",
        description: "Pilot mapping outlet horeca dan potensi aktivasi produk.",
        startDate: "2026-08-01",
        endDate: "2026-10-31",
        status: "draft",
        contractValue: 250000000,
        targetVisits: 350,
        targetOutlets: 90,
        region: "Depok dan Jakarta Selatan",
        notes: "Menunggu persetujuan kontrak.",
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "PRJ006",
        clientId: "CL005",
        name: "Retail Compliance 2025",
        code: "PRN-RC-25",
        description: "Audit kepatuhan outlet dan validasi display.",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        status: "completed",
        contractValue: 780000000,
        targetVisits: 1500,
        targetOutlets: 250,
        region: "Tangerang dan Jakarta Barat",
        notes: "Project selesai.",
        createdAt: stamp,
        updatedAt: stamp,
      },
    ];
  }
  const emp = Object.fromEntries(db.employees.map((e) => [e.id, e]));
  if (!db.projectAssignments.length) {
    const rows = [];
    let n = 1;
    const add = (projectId, employeeId, roleOnProject) => {
      if (emp[employeeId])
        rows.push({
          id: `ASN${String(n++).padStart(3, "0")}`,
          projectId,
          employeeId,
          roleOnProject,
          assignedAt: stamp,
          assignedBy: "ACC001",
          status: "active",
        });
    };
    add("PRJ001", "EMP005", "supervisor");
    add("PRJ001", "EMP001", "sales");
    add("PRJ001", "EMP002", "sales");
    add("PRJ001", "EMP003", "sales");
    add("PRJ002", "EMP005", "supervisor");
    add("PRJ002", "EMP001", "sales");
    add("PRJ002", "EMP004", "sales");
    add("PRJ003", "EMP006", "supervisor");
    add("PRJ003", "EMP007", "sales");
    add("PRJ003", "EMP008", "sales");
    add("PRJ004", "EMP005", "supervisor");
    add("PRJ004", "EMP003", "sales");
    db.projectAssignments = rows;
    changed = true;
  }
  const assignmentCounts = db.projectAssignments
    .filter((a) => a.status === "active")
    .reduce((counts, a) => {
      counts[a.employeeId] = (counts[a.employeeId] || 0) + 1;
      return counts;
    }, {});
  const nextAssignments = db.projectAssignments.map((assignment) => {
    const project = db.projects.find((p) => p.id === assignment.projectId);
    const assignedEmployee = db.employees.find(
      (employee) => employee.id === assignment.employeeId,
    );
    const assignedAccount = db.accounts.find(
      (user) => user.employeeId === assignment.employeeId,
    );
    const eligible =
      assignedEmployee?.status === "active" &&
      assignedAccount &&
      assignedAccount.status !== "inactive";
    const projectSupervisor = db.projectAssignments.find(
      (candidate) =>
        candidate.projectId === assignment.projectId &&
        candidate.roleOnProject === "supervisor" &&
        candidate.status === "active",
    );
    const normalized = {
      startDate: project?.startDate || "",
      endDate: project?.endDate || "",
      allocationPercent: Math.floor(
        100 / (assignmentCounts[assignment.employeeId] || 1),
      ),
      supervisorId:
        assignment.roleOnProject === "supervisor"
          ? null
          : projectSupervisor?.employeeId || null,
      notes: "Migrasi assignment lama",
      ...assignment,
    };
    if (!eligible && normalized.status === "active") {
      normalized.status = "removed";
      normalized.removedAt = stamp;
      normalized.removalReason = "Karyawan atau akun login tidak aktif";
    }
    return normalized;
  });
  if (JSON.stringify(nextAssignments) !== JSON.stringify(db.projectAssignments)) {
    db.projectAssignments = nextAssignments;
    changed = true;
  }
  db.projects.forEach((p) => {
    if (!db.projectSettings.some((s) => s.projectId === p.id)) {
      db.projectSettings.push({
        projectId: p.id,
        organizationId: p.organizationId || DEFAULT_ORG_ID,
        modules: defaultModules(),
        updatedAt: stamp,
        updatedBy: "ACC001",
      });
      changed = true;
    }
  });
  [
    "visits",
    "competitorIntel",
    "fieldPhotos",
    "priceObservations",
    "stocks",
  ].forEach((k) => {
    if (Array.isArray(db[k])) {
      const next = db[k].map((r) =>
        Object.prototype.hasOwnProperty.call(r, "projectId")
          ? r
          : { ...r, projectId: null },
      );
      if (next.some((row, i) => row !== db[k][i])) {
        db[k] = next;
        changed = true;
      }
    }
  });
  ["clients", "projects", "projectAssignments"].forEach((key) => {
    if (Array.isArray(db[key])) {
      const next = db[key].map((row) =>
        row.organizationId ? row : { ...row, organizationId: DEFAULT_ORG_ID },
      );
      if (next.some((row, i) => row !== db[key][i])) {
        db[key] = next;
        changed = true;
      }
    }
  });
  if (changed) writeDB(db);
}
function state() {
  return window.FT?.state || {};
}
function account() {
  return getActor() || state().account || null;
}
function employee() {
  const db = viewDB(),
    a = account();
  return db.employees?.find((e) => e.id === a?.employeeId) || null;
}
function role() {
  const a = account(),
    e = employee();
  if (a?.role === "superadmin" || a?.role === "head" || a?.role === "admin") return "manager";
  if (a?.role === "manager") return "project-manager";
  if (
    a?.role === "supervisor" ||
    String(e?.role || "")
      .toLowerCase()
      .includes("supervisor")
  )
    return "supervisor";
  return a ? "sales" : "guest";
}
function activeAssignments(employeeId) {
  const db = viewDB();
  return (db.projectAssignments || [])
    .filter((a) => a.employeeId === employeeId && a.status === "active")
    .filter((a) =>
      db.projects?.some((p) => p.id === a.projectId && p.status === "active"),
    );
}
function accessibleProjectIds() {
  if (role() === "manager")
    return new Set((viewDB().projects || []).map((p) => p.id));
  if (role() === "project-manager") return new Set(managerProjectIds(account()));
  return new Set(
    activeAssignments(account()?.employeeId).map((a) => a.projectId),
  );
}
function projectModules() {
  const db = viewDB(),
    ids = accessibleProjectIds(),
    projects = (db.projects || []).filter((p) => ids.has(p.id));
  const legacySettings = Object.fromEntries(
    (db.projectSettings || []).map((s) => [s.projectId, s]),
  );
  return Object.fromEntries(
    ALL_MODULES.map((m) => [
      m,
      projects.some((p) => {
        const modules = p.modules || legacySettings[p.id]?.modules || defaultModules();
        return modules?.[m] !== false;
      }),
    ]),
  );
}
function canManage() {
  return role() === "manager" || role() === "project-manager";
}
function canManageClients() {
  return ["superadmin", "head", "admin"].includes(account()?.role);
}
function canCreateProject() {
  return ["superadmin", "head", "admin"].includes(account()?.role);
}
function scopedEmployees(projectId = null) {
  const db = viewDB(),
    r = role(),
    me = employee();
  if (r === "manager") return db.employees || [];
  if (r === "project-manager") {
    const projectIds = accessibleProjectIds();
    const ids = new Set((db.projectAssignments || []).filter((a) => projectIds.has(a.projectId) && a.status === "active").map((a) => a.employeeId));
    return (db.employees || []).filter((e) => ids.has(e.id));
  }
  if (r === "supervisor") {
    const projectIds = accessibleProjectIds();
    const scope = projectId ? new Set([projectId]) : projectIds;
    const subordinateIds = new Set(subordinateEmployeeIds(
      db.projectAssignments || [],
      { id:me?.id, authUserId:account()?.id },
      scope,
    ));
    return (db.employees || []).filter((e) => e.id === me?.id || subordinateIds.has(String(e.id)));
  }
  return (db.employees || []).filter((e) => e.id === me?.id);
}
function injectStyles() {
  if (document.getElementById("projectV7Styles")) return;
  const s = document.createElement("style");
  s.id = "projectV7Styles";
  s.textContent = `.pm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-bottom:18px}.pm-kpi,.pm-panel{background:rgba(255,255,255,.96);border:1px solid #e8ebf1;border-radius:18px;box-shadow:0 8px 28px rgba(24,31,45,.07);transition:.2s}.pm-kpi{padding:18px}.pm-kpi:hover,.pm-panel:hover{transform:translateY(-2px);box-shadow:0 16px 42px rgba(24,31,45,.11)}.pm-kpi-label{font-size:12px;color:#7f8794}.pm-kpi-value{font-size:28px;font-weight:800;margin-top:4px}.pm-kpi-note{font-size:11px;color:#94a3b8;margin-top:6px}.pm-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}.pm-toolbar .input,.pm-toolbar .select{max-width:250px}.pm-client-cell{display:flex;align-items:center;gap:10px}.pm-client-logo{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#ff6b20,#d94400);color:white;display:grid;place-items:center;font-weight:800;font-size:12px}.pm-badge{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#eef2ff;color:#475569}.pm-badge.active{background:#e9fbf4;color:#07845d}.pm-badge.inactive,.pm-badge.cancelled,.pm-badge.removed{background:#fff0f0;color:#c2410c}.pm-badge.prospect,.pm-badge.draft,.pm-badge.on_hold{background:#fff7e6;color:#b45309}.pm-badge.completed{background:#eef2ff;color:#4338ca}.pm-actions{display:flex;gap:6px;flex-wrap:wrap}.pm-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.pm-detail-card{padding:17px;border:1px solid #edf0f4;border-radius:15px;background:#fbfcfe}.pm-detail-label{font-size:11px;color:#8a93a1}.pm-detail-value{font-size:13px;font-weight:600;margin-top:4px;white-space:pre-wrap}.pm-modules{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:9px}.pm-module{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border:1px solid #e8ebf1;border-radius:12px;background:#fff}.pm-module input{width:18px;height:18px;accent-color:#ef5000}.pm-modal{position:fixed;inset:0;background:rgba(15,23,42,.52);display:flex;align-items:center;justify-content:center;padding:18px;z-index:500}.pm-modal-card{width:min(720px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;box-shadow:0 30px 90px rgba(0,0,0,.28)}.pm-modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #edf0f4;position:sticky;top:0;background:#fff;z-index:2}.pm-modal-body{padding:20px}.pm-close{border:0;width:35px;height:35px;border-radius:50%;background:#f1f5f9;font-size:20px;cursor:pointer}.pm-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pm-form .full{grid-column:1/-1}.pm-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}.pm-tab{padding:8px 12px;border:1px solid #e5e7eb;border-radius:999px;background:#fff;cursor:pointer;font-size:12px;font-weight:700}.pm-tab.active{background:#fff1e8;color:#c94300;border-color:#fed7aa}.pm-supervisor-row{display:grid;grid-template-columns:1.5fr repeat(4,1fr);gap:8px;align-items:center;padding:12px;border-bottom:1px solid #edf0f4}.pm-supervisor-row.head{font-size:11px;font-weight:700;color:#94a3b8}.pm-project-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;background:#fff1e8;color:#c94300;font-size:11px;font-weight:700;margin:3px}.pm-project-selector{margin-bottom:12px;padding:12px;background:#fff8f3;border:1px solid #fed7aa;border-radius:12px}.pm-hidden{display:none!important}.pm-client-logo-img{width:38px;height:38px;border-radius:11px;object-fit:contain;background:#fff;border:1px solid #e8ebf1}.pm-subtext{font-size:11px;color:#94a3b8}.pm-sync{font-size:11px;color:#64748b;padding:5px 9px;border-radius:999px;background:#f1f5f9}.pm-sync-ok{color:#047857;background:#ecfdf5}.pm-sync-progress{color:#b45309;background:#fffbeb}.pm-sync-error{color:#b91c1c;background:#fef2f2}.pm-result-summary{font-size:12px;color:#64748b;margin:0 0 10px}.pm-pager{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:12px}.pm-empty{text-align:center;padding:28px;color:#94a3b8}.pm-pic-list{display:grid;gap:8px}.pm-pic-row{display:grid;grid-template-columns:1.2fr 1fr 1fr 1.2fr auto;gap:8px;align-items:center}@media(max-width:700px){.pm-form,.pm-detail-grid{grid-template-columns:1fr}.pm-form .full{grid-column:auto}.pm-toolbar .input,.pm-toolbar .select{max-width:none;width:100%}.pm-supervisor-row{grid-template-columns:1.4fr repeat(2,1fr)}.pm-supervisor-row>*:nth-child(n+4){display:none}.pm-pic-row{grid-template-columns:1fr}.pm-client-table thead,.pm-project-table thead,.pm-assignment-table thead{display:none}.pm-client-table,.pm-client-table tbody,.pm-client-table tr,.pm-client-table td,.pm-project-table,.pm-project-table tbody,.pm-project-table tr,.pm-project-table td,.pm-assignment-table,.pm-assignment-table tbody,.pm-assignment-table tr,.pm-assignment-table td{display:block;width:100%}.pm-client-table tr,.pm-project-table tr,.pm-assignment-table tr{border:1px solid #e8ebf1;border-radius:14px;margin-bottom:10px;padding:10px}.pm-client-table td,.pm-project-table td,.pm-assignment-table td{border:0!important;padding:8px 4px!important;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.pm-client-table td::before,.pm-project-table td::before,.pm-assignment-table td::before{content:attr(data-label);font-size:11px;font-weight:700;color:#94a3b8;min-width:82px}.pm-client-table td[data-label="Klien"]{display:block}.pm-client-table td[data-label="Klien"]::before{display:none}.pm-pager{justify-content:center}}`;
  document.head.appendChild(s);
}
function ensureNav() {
  const nav = document.querySelector(".sidebar-nav");
  if (!nav || !account()) return;
  const r = role();
  const signature = `${r}:${account()?.id || ""}`;
  const existing = nav.querySelector("[data-pm-nav]");
  if (existing?.dataset.pmSignature === signature) {
    existing
      .querySelectorAll(".nav-item")
      .forEach((x) =>
        x.classList.toggle("active", x.getAttribute("href") === location.hash),
      );
    applyModuleVisibility();
    return;
  }
  nav.querySelectorAll("[data-pm-nav]").forEach((x) => x.remove());
  applyModuleVisibility();
  return;
  let items = [];
  const frag = document.createElement("div");
  frag.dataset.pmNav = "1";
  frag.dataset.pmSignature = signature;
  frag.innerHTML = `<div class="nav-section-label">Project</div>${items.map(([ic, l, h]) => `<a class="nav-item" href="${h}"><span class="nav-icon">${svg(ic)}</span><span>${l}</span></a>`).join("")}`;
  nav.appendChild(frag);
  applyModuleVisibility();
}
function applyModuleVisibility() {
  if (role() === "manager" || !account()) return;
  const m = projectModules();
  const mapping = {
    visits: ["#/myvisits", "#/visits"],
    stocks: ["#/mystocks", "#/stocks"],
    prices: ["#/myprices"],
    competitorIntel: ["#/myintel", "#/competitors", "#/competitor-analysis"],
    photos: ["#/myphotos", "#/field-photos"],
    attendance: ["#/myattendance", "#/attendance"],
    leaves: ["#/myleaves", "#/leaves"],
  };
  Object.entries(mapping).forEach(([key, routes]) =>
    routes.forEach((h) =>
      document
        .querySelectorAll(`.nav-item[href="${h}"]`)
        .forEach((el) => el.classList.toggle("pm-hidden", !m[key])),
    ),
  );
}
function shell(title, subtitle, body) {
  const content = document.querySelector(".content");
  if (!content) return false;
  const t = document.querySelector(".topbar-title"),
    s = document.querySelector(".topbar-subtitle");
  if (t) t.textContent = title;
  if (s) s.textContent = subtitle;
  content.dataset.pmRoute = location.hash;
  content.innerHTML = body;
  document
    .querySelectorAll(".nav-item")
    .forEach((x) =>
      x.classList.toggle("active", x.getAttribute("href") === location.hash),
    );
  return true;
}
const clientById = (db) =>
  Object.fromEntries((db.clients || []).map((x) => [x.id, x]));
const projectById = (db) =>
  Object.fromEntries((db.projects || []).map((x) => [x.id, x]));
function statusBadge(v) {
  return `<span class="pm-badge ${esc(v)}">${esc(String(v).replace("_", " "))}</span>`;
}
function kpis(items) {
  return `<div class="pm-grid">${items.map((x) => `<div class="pm-kpi"><div class="pm-kpi-label">${esc(x[0])}</div><div class="pm-kpi-value">${esc(x[1])}</div>${x[2] ? `<div class="pm-kpi-note">${esc(x[2])}</div>` : ""}</div>`).join("")}</div>`;
}

let clientPage = 1;
function clientSyncLabel() {
  const state = clientSyncState(cloudDataStatus());
  const suffix = state.tone === 'local' ? '' : ` pm-sync-${state.tone}`;
  return `<span class="pm-sync${suffix}">${esc(state.label)}</span>`;
}
function additionalPicRows(pics = []) {
  const rows = pics.length ? pics : [{ name:'', role:'', phone:'', email:'' }];
  return rows.map((p) => `<div class="pm-pic-row">
    <input class="input" name="additionalPicName" placeholder="Nama" value="${esc(p.name || '')}">
    <input class="input" name="additionalPicRole" placeholder="Jabatan" value="${esc(p.role || '')}">
    <input class="input" name="additionalPicPhone" placeholder="Telepon" value="${esc(p.phone || '')}">
    <input class="input" type="email" name="additionalPicEmail" placeholder="Email" value="${esc(p.email || '')}">
    <button type="button" class="btn btn-secondary btn-sm" data-pqt-onclick="PM.removeAdditionalPic(this)">Hapus</button>
  </div>`).join('');
}
function renderClients() {
  const db = viewDB(), rows = db.clients || [];
  const rendered = shell(
    "Klien",
    "Master perusahaan, PIC dan periode kerja sama",
    `${kpis([
      ["Total Klien", rows.length],
      ["Aktif", rows.filter((x) => x.status === "active").length],
      ["Prospect", rows.filter((x) => x.status === "prospect").length],
      ["Project Terhubung", (db.projects || []).length],
    ])}<div class="card">
      <div class="pm-toolbar">
        ${canManageClients() ? `<button class="btn btn-secondary" data-pqt-onclick="FT.openBulkMaster('clients')">Bulk Upload</button><button class="btn btn-primary" data-pqt-onclick="PM.openClient()">${svg("plus")} Tambah Klien</button>` : ""}
        <input class="input" id="clientSearch" placeholder="Cari klien, PIC, kota" aria-label="Cari klien" data-pqt-oninput="PM.filterClients(1)">
        <select class="select" id="clientStatusFilter" aria-label="Filter status klien" data-pqt-onchange="PM.filterClients(1)"><option value="">Semua status</option><option value="active">Aktif</option><option value="prospect">Prospect</option><option value="inactive">Nonaktif</option></select>
        <span id="clientSyncState">${clientSyncLabel()}</span>
      </div>
      <div id="clientResultSummary" class="pm-result-summary" role="status" aria-live="polite"></div>
      <div class="visits-table-wrapper"><table class="table pm-client-table"><thead><tr><th>Klien</th><th>Industri</th><th>PIC Utama</th><th>Lokasi</th><th>Project</th><th>Status</th><th>Aksi</th></tr></thead><tbody id="clientRows">${rows.map((c) => {
        const projectCount=(db.projects || []).filter((p) => p.clientId === c.id).length;
        const initials=String(c.name || '?').split(" ").map((x) => x[0]).slice(0,2).join("");
        const logo=c.logoUrl || c.logo || '';
        return `<tr data-client-id="${esc(c.id)}" data-status="${esc(c.status)}" data-search="${esc(clientSearchDocument(c))}">
          <td data-label="Klien"><div class="pm-client-cell">${logo ? `<img class="pm-client-logo-img" alt="" src="${esc(logo)}">` : `<span class="pm-client-logo">${esc(initials)}</span>`}<div><strong>${esc(c.name)}</strong><div class="pm-subtext">${esc(c.legalName || "")}</div></div></div></td>
          <td data-label="Industri">${esc(c.industry || '-')}</td>
          <td data-label="PIC Utama"><strong>${esc(c.picName || "-")}</strong><div class="pm-subtext">${esc(c.picRole || "")}</div></td>
          <td data-label="Lokasi">${esc([c.city,c.province].filter(Boolean).join(", ") || '-')}</td>
          <td data-label="Project">${projectCount}</td>
          <td data-label="Status"><span class="pm-badge ${esc(c.status)}">${esc(clientStatusLabel(c.status))}</span></td>
          <td data-label="Aksi"><div class="pm-actions"><button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.viewClient('${c.id}')">${svg("eye")} Detail</button>${canManageClients() ? `<button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.openClient('${c.id}')">${svg("edit")} Edit</button>` : ""}</div></td>
        </tr>`;
      }).join("")}</tbody></table></div>
      <div id="clientEmpty" class="pm-empty" hidden>Tidak ada klien yang sesuai dengan filter.</div>
      <div id="clientPager" class="pm-pager" hidden><button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.clientPage(-1)">Sebelumnya</button><span id="clientPageLabel"></span><button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.clientPage(1)">Berikutnya</button></div>
    </div>`,
  );
  queueMicrotask(() => window.PM?.filterClients?.(clientPage));
  return rendered;
}
let projectPage = 1;
function projectSyncLabel() {
  const state = projectSyncState(cloudDataStatus());
  const suffix = state.tone === 'local' ? '' : ` pm-sync-${state.tone}`;
  return `<span class="pm-sync${suffix}">${esc(state.label)}</span>`;
}
function renderProjects(readOnly = false) {
  const db = viewDB(),
    cm = clientById(db),
    ids = accessibleProjectIds();
  const rows = (db.projects || []).filter(
    (p) => role() === "manager" || ids.has(p.id),
  );
  const rendered = shell(
    readOnly ? "Project Saya" : "Project",
    readOnly
      ? "Informasi ringkas project yang ditugaskan kepada Anda"
      : "SoW, periode, target, assignment dan pengaturan modul",
    `${kpis([
      ["Total Project", rows.length],
      ["Aktif", rows.filter((x) => x.status === "active").length],
      ["Draft / Hold", rows.filter((x) => ["draft", "on_hold"].includes(x.status)).length],
      ["Assignment Aktif", (db.projectAssignments || []).filter((x) => x.status === "active" && rows.some((p) => p.id === x.projectId)).length],
    ])}<div class="card">
      <div class="pm-toolbar">
        ${!readOnly && canManage() ? `<button class="btn btn-secondary" data-pqt-onclick="FT.openBulkMaster('projects')">Bulk Upload</button>${canCreateProject() ? `<button class="btn btn-primary" data-pqt-onclick="PM.openProject()">${svg("plus")} Tambah Project</button>` : ""}` : ""}
        <input class="input" id="projectSearch" placeholder="Cari project, kode, klien" aria-label="Cari project" data-pqt-oninput="PM.filterProjects(1)">
        <select class="select" id="projectStatusFilter" aria-label="Filter status project" data-pqt-onchange="PM.filterProjects(1)">
          <option value="">Semua status</option><option value="active">Aktif</option><option value="draft">Draft</option><option value="on_hold">Ditahan</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option>
        </select>
        <select class="select" id="projectClientFilter" aria-label="Filter klien project" data-pqt-onchange="PM.filterProjects(1)"><option value="">Semua klien</option>${(db.clients || []).map((client) => `<option value="${client.id}">${esc(client.name)}</option>`).join("")}</select>
        <span id="projectSyncState">${projectSyncLabel()}</span>
      </div>
      <div id="projectResultSummary" class="pm-result-summary" role="status" aria-live="polite"></div>
      <div class="visits-table-wrapper"><table class="table pm-project-table"><thead><tr><th>Project</th><th>Klien</th><th>Periode</th>${readOnly ? "<th>Supervisor</th><th>Manager</th><th>Status</th><th>Aksi</th>" : "<th>Target</th><th>Assignee</th><th>Status</th><th>Aksi</th>"}</tr></thead><tbody id="projectRows">${rows.map((p) => {
        const client = cm[p.clientId] || {};
        const assignments = (db.projectAssignments || []).filter((a) => a.projectId === p.id && a.status === "active");
        const managers = projectManagerNames(db,p.id);
        const supervisors = projectSupervisorNames(db,p.id);
        const search = esc(projectSearchDocument(p, { clientName:client.name, managerNames:managers, supervisorNames:supervisors }));
        if (readOnly) {
          return `<tr data-status="${esc(p.status)}" data-client="${esc(p.clientId)}" data-search="${search}">
            <td data-label="Project"><strong>${esc(p.name)}</strong><div class="pm-subtext">${esc(p.code || "")}</div></td>
            <td data-label="Klien">${esc(client.name || "-")}</td>
            <td data-label="Periode">${dateLabel(p.startDate)} – ${dateLabel(p.endDate)}</td>
            <td data-label="Supervisor">${esc(supervisors.join(", ") || "—")}</td>
            <td data-label="Manager">${esc(managers.join(", ") || "—")}</td>
            <td data-label="Status"><span class="pm-badge ${esc(p.status)}">${esc(projectStatusLabel(p.status))}</span></td>
            <td data-label="Aksi"><button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.viewProject('${p.id}')">${svg("eye")} Detail</button></td>
          </tr>`;
        }
        return `<tr data-status="${esc(p.status)}" data-client="${esc(p.clientId)}" data-search="${search}">
          <td data-label="Project"><strong>${esc(p.name)}</strong><div class="pm-subtext">${esc(p.code || "")}</div></td>
          <td data-label="Klien">${esc(client.name || "-")}</td>
          <td data-label="Periode">${dateLabel(p.startDate)} – ${dateLabel(p.endDate)}</td>
          <td data-label="Target">${p.targetVisits || "-"} visit<br><span class="pm-subtext">${p.targetOutlets || "-"} outlet</span></td>
          <td data-label="Assignee">${assignments.length}</td>
          <td data-label="Status"><span class="pm-badge ${esc(p.status)}">${esc(projectStatusLabel(p.status))}</span></td>
          <td data-label="Aksi"><div class="pm-actions"><button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.viewProject('${p.id}')">${svg("eye")} Detail</button>${canManage() ? `<button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.openProject('${p.id}')">${svg("edit")} Edit</button>` : ""}</div></td>
        </tr>`;
      }).join("")}</tbody></table></div>
      <div id="projectEmpty" class="pm-empty" hidden>Tidak ada project yang sesuai dengan filter.</div>
      <div id="projectPager" class="pm-pager" hidden><button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.projectPage(-1)">Sebelumnya</button><span id="projectPageLabel"></span><button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.projectPage(1)">Berikutnya</button></div>
    </div>`,
  );
  queueMicrotask(() => window.PM?.filterProjects?.(projectPage));
  return rendered;
}
let assignmentPage = 1;
function assignmentSyncLabel() {
  const state = assignmentSyncState(cloudDataStatus());
  const suffix = state.tone === 'local' ? '' : ` pm-sync-${state.tone}`;
  return `<span class="pm-sync${suffix}">${esc(state.label)}</span>`;
}
function renderAssignments() {
  const db = viewDB(),
    pm = projectById(db),
    cm = clientById(db),
    em = Object.fromEntries((db.employees || []).map((x) => [x.id, x])),
    ids = accessibleProjectIds(),
    scopedProjects = (db.projects || []).filter((p) => role() === "manager" || ids.has(p.id)),
    rows = (db.projectAssignments || []).filter((a) => role() === "manager" || ids.has(a.projectId));
  const rendered = shell(
    "Assignment Project",
    "Penugasan supervisor, sales dan viewer per project",
    `${kpis([
      ["Assignment", rows.length],
      ["Aktif", rows.filter((x) => x.status === "active").length],
      ["Supervisor", rows.filter((x) => x.status === "active" && x.roleOnProject === "supervisor").length],
      ["Sales", rows.filter((x) => x.status === "active" && x.roleOnProject === "sales").length],
    ])}<div class="card">
      <div class="pm-toolbar">
        <button class="btn btn-primary" data-pqt-onclick="PM.openAssignmentCreate()">${svg("plus")} Tambah Assignment</button>
        <select class="select" id="assignmentProjectFilter" aria-label="Filter project" data-pqt-onchange="PM.filterAssignments(1)"><option value="">Semua project</option>${scopedProjects.map((p) => `<option value="${p.id}">${esc(p.code)} — ${esc(p.name)}</option>`).join("")}</select>
        <select class="select" id="assignmentStatusFilter" aria-label="Filter status assignment" data-pqt-onchange="PM.filterAssignments(1)"><option value="">Semua status</option><option value="active">Aktif</option><option value="ended">Selesai</option></select>
        <select class="select" id="assignmentRoleFilter" aria-label="Filter role assignment" data-pqt-onchange="PM.filterAssignments(1)"><option value="">Semua role</option><option value="supervisor">Supervisor</option><option value="sales">Field Sales</option><option value="viewer">Viewer</option></select>
        <input class="input" id="assignmentSearch" placeholder="Cari project, karyawan, supervisor" aria-label="Cari assignment" data-pqt-oninput="PM.filterAssignments(1)">
        <span id="assignmentSyncState">${assignmentSyncLabel()}</span>
      </div>
      <div id="assignmentResultSummary" class="pm-result-summary" role="status" aria-live="polite"></div>
      <div class="visits-table-wrapper"><table class="table pm-assignment-table"><thead><tr><th>Project</th><th>Klien</th><th>Karyawan</th><th>Role</th><th>Supervisor</th><th>Periode / Kapasitas</th><th>Status</th><th>Aksi</th></tr></thead><tbody id="assignmentRows">${rows.map((a) => {
        const p = pm[a.projectId] || {}, e = em[a.employeeId] || {}, sp = em[a.supervisorId] || {}, normalizedStatus = normalizeAssignmentStatus(a.status);
        const search = assignmentSearchDocument(a, { projectName:p.name, projectCode:p.code, clientName:cm[p.clientId]?.name, employeeName:e.name, supervisorName:sp.name });
        return `<tr data-project="${esc(a.projectId)}" data-status="${esc(normalizedStatus)}" data-role="${esc(a.roleOnProject || '')}" data-search="${esc(search)}">
          <td data-label="Project"><strong>${esc(p.name || a.projectId)}</strong><div class="pm-subtext">${esc(p.code || "")}</div></td>
          <td data-label="Klien">${esc(cm[p.clientId]?.name || "-")}</td>
          <td data-label="Karyawan"><strong>${esc(e.name || a.employeeId)}</strong><div class="pm-subtext">${esc(e.employeeCode || e.code || '')}</div></td>
          <td data-label="Role"><span class="pm-badge">${esc(assignmentRoleLabel(a.roleOnProject))}</span></td>
          <td data-label="Supervisor">${esc(sp.name || (a.roleOnProject === 'supervisor' ? '—' : '-'))}</td>
          <td data-label="Periode / Kapasitas">${dateLabel(a.startDate)} – ${dateLabel(a.endDate)}<div class="pm-subtext">${Number(a.allocationPercent || 100)}% kapasitas</div></td>
          <td data-label="Status"><span class="pm-badge ${esc(normalizedStatus)}">${esc(assignmentStatusLabel(normalizedStatus))}</span></td>
          <td data-label="Aksi"><div class="pm-actions"><button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.viewAssignment('${a.id}')">${svg("eye")} Detail</button>${normalizedStatus === "active" ? `<button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.toggleAssignment('${a.id}')">${svg("unlink")} Unassign</button>` : ""}</div></td>
        </tr>`;
      }).join("")}</tbody></table></div>
      <div id="assignmentEmpty" class="pm-empty" hidden>Tidak ada assignment yang sesuai dengan filter.</div>
      <div id="assignmentPager" class="pm-pager" hidden><button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.assignmentPage(-1)">Sebelumnya</button><span id="assignmentPageLabel"></span><button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.assignmentPage(1)">Berikutnya</button></div>
    </div>`,
  );
  queueMicrotask(() => window.PM?.filterAssignments?.(assignmentPage));
  return rendered;
}
function renderMyTeam() {
  const db = viewDB(),
    me = employee(),
    ids = accessibleProjectIds(),
    team = scopedEmployees();
  const pm = projectById(db);
  const members = team.filter((e) => e.id !== me?.id);
  const memberIds = new Set(members.map((e) => String(e.id)));
  const visits = (db.visits || []).filter(
    (v) =>
      memberIds.has(String(v.employeeId)) &&
      (!v.projectId || ids.has(v.projectId)),
  );
  return shell(
    "Tim Saya",
    "Sales di bawah supervisi dan project yang sama",
    `${kpis([
      ["Anggota Tim", members.length],
      ["Project Aktif", ids.size],
      ["Kunjungan", visits.length],
      ["Selesai", visits.filter((v) => v.status === "completed").length],
    ])}<div class="card">
      <div class="pm-toolbar">
        <select class="select" id="teamProjectFilter" aria-label="Filter project tim" data-pqt-onchange="PM.filterMyTeam()"><option value="">Semua project</option>${[...ids].map(id => `<option value="${esc(id)}">${esc(pm[id]?.code || id)} — ${esc(pm[id]?.name || '')}</option>`).join("")}</select>
        <input class="input" id="teamSearch" placeholder="Cari nama atau area" aria-label="Cari anggota tim" data-pqt-oninput="PM.filterMyTeam()">
      </div>
      <div id="teamResultSummary" class="pm-result-summary" role="status" aria-live="polite"></div>
      <div class="visits-table-wrapper"><table class="table pm-team-table"><thead><tr><th>Karyawan</th><th>Area</th><th>Project</th><th>Supervisor</th><th>Kapasitas</th><th>Kunjungan</th><th>Status</th><th>Aksi</th></tr></thead><tbody id="teamRows">${members
      .map((e) => {
        const assignments = (db.projectAssignments || []).filter(
          (a) => a.employeeId === e.id && a.status === "active" && ids.has(a.projectId),
        );
        const summary = teamMemberSummary(e, assignments, visits, pm);
        const search = `${e.name || ''} ${e.area || ''} ${summary.projectCodes.join(' ')}`.toLowerCase();
        return `<tr data-search="${esc(search)}" data-projects="${esc(summary.projectIds.join('|'))}">
          <td data-label="Karyawan"><strong>${esc(e.name)}</strong><div class="pm-subtext">${esc(e.role)}</div></td>
          <td data-label="Area">${esc(e.area || "-")}</td>
          <td data-label="Project">${assignments.map((a) => `<span class="pm-project-chip">${esc(pm[a.projectId]?.code || a.projectId)}</span>`).join("") || "-"}</td>
          <td data-label="Supervisor">${esc(me?.name || '-')}</td>
          <td data-label="Kapasitas">${summary.capacity}%</td>
          <td data-label="Kunjungan">${summary.completedVisits}/${summary.visits}</td>
          <td data-label="Status">${statusBadge(e.status || "active")}</td>
          <td data-label="Aksi"><button class="btn btn-secondary btn-sm" data-pqt-onclick="location.hash='#/employee/${e.id}'">Detail</button></td>
        </tr>`;
      })
      .join("")}</tbody></table></div>
      <div id="teamEmpty" class="pm-empty" hidden>Tidak ada anggota tim yang sesuai dengan filter.</div>
    </div>`,
  );
}

function renderSupervisorCompare() {
  const db = viewDB(),
    ids = accessibleProjectIds(),
    pm = projectById(db);
  const supervisors = (db.employees || [])
    .filter((e) => String(e.role || "").toLowerCase().includes("supervisor"))
    .filter((e) => (db.projectAssignments || []).some(
      (a) => a.employeeId === e.id && a.status === "active" && ids.has(a.projectId),
    ));
  const metric = (s, projectId = "") => supervisorMetrics(
    db,
    s,
    projectId ? [projectId] : [...ids],
  );
  return shell(
    "Komparasi Supervisor",
    "Ringkasan agregat supervisor pada project yang sama tanpa detail sales lain",
    `${kpis([
      ["Supervisor Terbanding", supervisors.length],
      ["Project Bersama", ids.size],
      ["Privasi Detail", "Terjaga", "Hanya metrik agregat"],
      ["Scope", "Project sama"],
    ])}<div class="card">
      <div class="pm-toolbar"><select class="select" id="supervisorCompareProject" aria-label="Filter project komparasi" data-pqt-onchange="PM.filterSupervisorCompare()"><option value="">Semua project</option>${[...ids].map(id => `<option value="${esc(id)}">${esc(pm[id]?.code || id)} — ${esc(pm[id]?.name || '')}</option>`).join("")}</select></div>
      <div class="pm-supervisor-row head"><span>Supervisor</span><span>Team</span><span>Visit</span><span>Intel</span><span>Foto</span><span>Harga</span></div>
      <div id="supervisorCompareRows">${supervisors.map((s) => {
        const m = metric(s);
        const projects = (db.projectAssignments || []).filter(a => a.employeeId === s.id && a.status === 'active' && ids.has(a.projectId)).map(a => a.projectId);
        return `<div class="pm-supervisor-row" data-projects="${esc([...new Set(projects)].join('|'))}" data-supervisor="${esc(s.id)}"><strong>${esc(s.name)}</strong><span data-metric="team">${m.team}</span><span data-metric="visits">${m.visits}</span><span data-metric="intel">${m.intel}</span><span data-metric="photos">${m.photos}</span><span data-metric="prices">${m.prices}</span></div>`;
      }).join("") || '<div style="padding:34px;text-align:center;color:#94a3b8">Belum ada supervisor lain pada project yang sama.</div>'}</div>
      <div class="pm-subtext" style="margin-top:10px">Metrik adalah total aktivitas anggota team dalam scope Project yang dipilih; Team menunjukkan jumlah anggota aktif sebagai denominator konteks.</div>
    </div>`,
  );
}

function renderRoute() {
  const h = location.hash;
  if (!PROJECT_ROUTES.has(h) || !account()) return false;
  if (h === "#/clients")
    return canManage() ? renderClients() : (location.hash = "#/my-projects");
  if (h === "#/projects")
    return canManage() ? renderProjects(false) : renderProjects(true);
  if (h === "#/assignments")
    return canManage()
      ? renderAssignments()
      : (location.hash = "#/my-projects");
  if (h === "#/my-projects") return renderProjects(true);
  if (h === "#/my-team")
    return role() === "supervisor"
      ? renderMyTeam()
      : (location.hash = "#/my-projects");
  if (h === "#/supervisor-compare")
    return role() === "supervisor"
      ? renderSupervisorCompare()
      : (location.hash = "#/my-projects");
  return false;
}
function modal(title, body) {
  document.getElementById("pmModal")?.remove();
  const el = document.createElement("div");
  el.id = "pmModal";
  el.className = "pm-modal";
  el.innerHTML = `<div class="pm-modal-card"><div class="pm-modal-head"><h3>${esc(title)}</h3><button class="pm-close" data-pqt-onclick="PM.close()">×</button></div><div class="pm-modal-body">${body}</div></div>`;
  document.body.appendChild(el);
}
function formValue(fd, k) {
  return String(fd.get(k) || "").trim();
}
window.PM = {
  renderRoute,
  close() {
    document.getElementById("pmModal")?.remove();
  },
  addAdditionalPic() {
    const root = document.getElementById("additionalPicRows");
    if (!root) return;
    root.insertAdjacentHTML("beforeend", additionalPicRows([{ name:"", role:"", phone:"", email:"" }]));
  },
  removeAdditionalPic(button) {
    const row = button?.closest?.(".pm-pic-row");
    const root = document.getElementById("additionalPicRows");
    if (!row || !root) return;
    if (root.querySelectorAll(".pm-pic-row").length === 1) row.querySelectorAll("input").forEach((input) => { input.value = ""; });
    else row.remove();
  },
  clientPage(delta) {
    clientPage = Math.max(1, clientPage + Number(delta || 0));
    this.filterClients(clientPage);
  },
  filterSupervisorCompare() {
    const db = viewDB();
    const projectId = String(document.getElementById("supervisorCompareProject")?.value || "");
    const ids = accessibleProjectIds();
    document.querySelectorAll("#supervisorCompareRows .pm-supervisor-row").forEach(row => {
      const supervisorId = String(row.dataset.supervisor || "");
      const projects = String(row.dataset.projects || "").split("|").filter(Boolean);
      const visible = !projectId || projects.includes(projectId);
      row.style.display = visible ? "" : "none";
      if (!visible) return;
      const supervisor = (db.employees || []).find(employee => String(employee.id) === supervisorId);
      if (!supervisor) return;
      const values = supervisorMetrics(db, supervisor, projectId ? [projectId] : [...ids]);
      Object.entries(values).forEach(([name,value]) => {
        const target = row.querySelector(`[data-metric="${name}"]`);
        if (target) target.textContent = String(value);
      });
    });
  },
  filterMyTeam() {
    const filters = {
      search:String(document.getElementById("teamSearch")?.value || ""),
      projectId:String(document.getElementById("teamProjectFilter")?.value || ""),
    };
    const rows = [...document.querySelectorAll("#teamRows tr")];
    const matched = rows.filter(row => {
      const visible = teamMatchesFilters({
        search:row.dataset.search || '',
        projectIds:String(row.dataset.projects || "").split("|").filter(Boolean),
      }, filters);
      row.style.display = visible ? "" : "none";
      return visible;
    });
    const summary = document.getElementById("teamResultSummary");
    if (summary) summary.textContent = matched.length ? `${matched.length} anggota tim ditampilkan` : "Tidak ada anggota tim yang sesuai dengan filter.";
    const empty = document.getElementById("teamEmpty");
    if (empty) empty.hidden = matched.length !== 0;
  },
  filterRows(id, q) {
    q = q.toLowerCase();
    document
      .querySelectorAll(`#${id} tr`)
      .forEach(
        (r) =>
          (r.style.display = (r.dataset.search || "").includes(q)
            ? ""
            : "none"),
      );
  },
  filterClients(page = clientPage) {
    const filters = {
      search:String(document.getElementById("clientSearch")?.value || ""),
      status:String(document.getElementById("clientStatusFilter")?.value || ""),
    };
    const rows = [...document.querySelectorAll("#clientRows tr")];
    const matched = rows.filter((row) => clientMatchesFilters({
      name:row.dataset.search || '',
      status:row.dataset.status || '',
    }, filters));
    const pageState = paginateClients(matched, page, CLIENT_PAGE_SIZE);
    clientPage = pageState.currentPage;
    const visible = new Set(pageState.items);
    rows.forEach((row) => { row.style.display = visible.has(row) ? "" : "none"; });
    const summary = document.getElementById("clientResultSummary");
    if (summary) summary.textContent = pageState.total ? `Menampilkan ${pageState.from}–${pageState.to} dari ${pageState.total} klien` : "Tidak ada klien yang sesuai dengan filter.";
    const empty = document.getElementById("clientEmpty");
    if (empty) empty.hidden = pageState.total !== 0;
    const pager = document.getElementById("clientPager");
    if (pager) pager.hidden = pageState.total <= CLIENT_PAGE_SIZE;
    const label = document.getElementById("clientPageLabel");
    if (label) label.textContent = `Halaman ${pageState.currentPage} / ${pageState.pageCount}`;
    const sync = document.getElementById("clientSyncState");
    if (sync) sync.innerHTML = clientSyncLabel();
  },
  projectPage(delta) {
    projectPage = Math.max(1, projectPage + Number(delta || 0));
    this.filterProjects(projectPage);
  },
  filterProjects(page = projectPage) {
    const filters = {
      search:String(document.getElementById("projectSearch")?.value || ""),
      status:String(document.getElementById("projectStatusFilter")?.value || ""),
      clientId:String(document.getElementById("projectClientFilter")?.value || ""),
    };
    const rows = [...document.querySelectorAll("#projectRows tr")];
    const matched = rows.filter((row) => projectMatchesFilters({
      search:row.dataset.search || '',
      status:row.dataset.status || '',
      clientId:row.dataset.client || '',
    }, filters));
    const pageState = paginateProjects(matched, page, PROJECT_PAGE_SIZE);
    projectPage = pageState.currentPage;
    const visible = new Set(pageState.items);
    rows.forEach((row) => { row.style.display = visible.has(row) ? "" : "none"; });
    const summary = document.getElementById("projectResultSummary");
    if (summary) summary.textContent = pageState.total ? `Menampilkan ${pageState.from}–${pageState.to} dari ${pageState.total} project` : "Tidak ada project yang sesuai dengan filter.";
    const empty = document.getElementById("projectEmpty");
    if (empty) empty.hidden = pageState.total !== 0;
    const pager = document.getElementById("projectPager");
    if (pager) pager.hidden = pageState.total <= PROJECT_PAGE_SIZE;
    const label = document.getElementById("projectPageLabel");
    if (label) label.textContent = `Halaman ${pageState.currentPage} / ${pageState.pageCount}`;
    const sync = document.getElementById("projectSyncState");
    if (sync) sync.innerHTML = projectSyncLabel();
  },
  filterStatus(id, v) {
    document
      .querySelectorAll(`#${id} tr`)
      .forEach(
        (r) => (r.style.display = !v || r.dataset.status === v ? "" : "none"),
      );
  },
  filterClient(id, v) {
    document
      .querySelectorAll(`#${id} tr`)
      .forEach(
        (r) => (r.style.display = !v || r.dataset.client === v ? "" : "none"),
      );
  },
  filterProject(id, v) {
    document
      .querySelectorAll(`#${id} tr`)
      .forEach(
        (r) => (r.style.display = !v || r.dataset.project === v ? "" : "none"),
      );
  },
  openClient(id = "") {
    if (!canManageClients()) return;
    const db = viewDB(),
      c = (db.clients || []).find((x) => x.id === id) || {},
      pics = c.additionalPics || [];
    modal(
      id ? "Edit Klien" : "Tambah Klien",
      `<form class="pm-form" data-pqt-onsubmit="PM.saveClient(event,'${id}')"><div class="full"><label class="label">Nama Perusahaan</label><input class="input" name="name" value="${esc(c.name || "")}" required></div><div><label class="label">Nama Legal</label><input class="input" name="legalName" value="${esc(c.legalName || "")}"></div><div><label class="label">Industri</label><select class="select" name="industry">${["FMCG", "Farmasi", "Bangunan", "Retail", "F&B", "Telco", "Lainnya"].map((x) => `<option ${c.industry === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div><label class="label">NPWP / SIUP</label><input class="input" name="npwp" value="${esc(c.npwp || "")}"></div><div><label class="label">Status</label><select class="select" name="status">${["active", "inactive", "prospect"].map((x) => `<option ${c.status === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="full"><label class="label">Alamat</label><textarea class="textarea" name="address">${esc(c.address || "")}</textarea></div><div><label class="label">Kota</label><input class="input" name="city" value="${esc(c.city || "")}"></div><div><label class="label">Provinsi</label><input class="input" name="province" value="${esc(c.province || "")}"></div><div class="full"><label class="label">Website</label><input class="input" type="text" inputmode="url" name="website" placeholder="https://example.com" value="${esc(c.website || "")}"><div class="pm-subtext">Boleh ditulis tanpa https://, sistem akan menormalkan URL.</div></div><div class="full"><label class="label">Logo klien</label><input class="input" type="file" name="logoFile" accept="image/jpeg,image/png,image/webp"><input type="hidden" name="logoUrl" value="${esc(c.logoUrl || c.logo || "")}">${c.logoUrl || c.logo ? `<img alt="Logo" src="${esc(c.logoUrl || c.logo)}" style="max-height:48px;margin-top:8px">` : ""}</div><div><label class="label">PIC Utama</label><input class="input" name="picName" value="${esc(c.picName || "")}" required></div><div><label class="label">Jabatan PIC</label><input class="input" name="picRole" value="${esc(c.picRole || "")}"></div><div><label class="label">Telepon PIC</label><input class="input" name="picPhone" value="${esc(c.picPhone || "")}"></div><div><label class="label">Email PIC</label><input class="input" type="email" name="picEmail" value="${esc(c.picEmail || "")}"></div><div><label class="label">Mulai Kerja Sama</label><input class="input" type="date" name="cooperationStart" value="${esc(c.cooperationStart || "")}"></div><div><label class="label">Akhir Kerja Sama</label><input class="input" type="date" name="cooperationEnd" value="${esc(c.cooperationEnd || "")}"></div><div class="full"><label class="label">PIC Tambahan</label><div id="additionalPicRows" class="pm-pic-list">${additionalPicRows(pics)}</div><button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px" data-pqt-onclick="PM.addAdditionalPic()">+ Tambah PIC</button></div><div class="full"><label class="label">Catatan</label><textarea class="textarea" name="notes">${esc(c.notes || "")}</textarea></div><div class="full"><button class="btn btn-primary btn-block">Simpan Klien</button></div></form>`,
    );
  },
  async saveClient(e, id) {
    e.preventDefault();
    if (!canManageClients()) return;
    const db = viewDB(),
      fd = new FormData(e.target),
      rows = db.clients || [],
      old = rows.find((x) => x.id === id),
      pics = normalizeAdditionalPics({
        names:fd.getAll("additionalPicName"),
        roles:fd.getAll("additionalPicRole"),
        phones:fd.getAll("additionalPicPhone"),
        emails:fd.getAll("additionalPicEmail"),
      });
    const name = formValue(fd, "name");
    const legalName = formValue(fd, "legalName");
    const cooperationStart = formValue(fd, "cooperationStart");
    const cooperationEnd = formValue(fd, "cooperationEnd");
    if (
      rows.some(
        (x) =>
          x.id !== id &&
          (x.name || "").toLowerCase() === name.toLowerCase(),
      )
    ) {
      alert("Nama klien sudah terdaftar.");
      return;
    }
    if (
      legalName &&
      rows.some(
        (x) =>
          x.id !== id &&
          (x.legalName || "").toLowerCase() === legalName.toLowerCase(),
      )
    ) {
      alert("Nama legal klien sudah terdaftar.");
      return;
    }
    if (cooperationStart && cooperationEnd && cooperationEnd < cooperationStart) {
      alert("Tanggal akhir kerja sama tidak boleh sebelum tanggal mulai.");
      return;
    }
    const websiteInput = formValue(fd, "website");
    if (websiteInput && !normalizeClientWebsite(websiteInput)) {
      window.showToast?.("Alamat website tidak valid.", "error");
      return;
    }
    const clientId = id || uid("CL");
    const data = {
      id: clientId,
      code: old?.code || clientId,
      name,
      legalName,
      industry: formValue(fd, "industry"),
      npwp: formValue(fd, "npwp"),
      address: formValue(fd, "address"),
      city: formValue(fd, "city"),
      province: formValue(fd, "province"),
      website: normalizeClientWebsite(formValue(fd, "website")),
      notes: formValue(fd, "notes"),
      status: formValue(fd, "status"),
      picName: formValue(fd, "picName"),
      picRole: formValue(fd, "picRole"),
      picPhone: formValue(fd, "picPhone"),
      picEmail: formValue(fd, "picEmail"),
      additionalPics: pics,
      cooperationStart,
      cooperationEnd,
      createdAt: old?.createdAt || now(),
      updatedAt: now(),
      organizationId: old?.organizationId || currentOrgId(),
      logo: old?.logo || "",
      logoUrl: formValue(fd, "logoUrl") || old?.logoUrl || old?.logo || "",
      r2Key: old?.r2Key || "",
    };
    const submit = e.target.querySelector('button[type="submit"], button:not([type])');
    if (submit) submit.disabled = true;
    let newlyUploadedKey = "";
    try {
      const file = e.target.querySelector('[name="logoFile"]')?.files?.[0];
      if (file) {
        if (!window.R2?.uploadAsset) throw Object.assign(new Error('UPLOAD_UNAVAILABLE'), { code:'UPLOAD_UNAVAILABLE' });
        const uploaded = await window.R2.uploadAsset(file, { category:'client-logo', projectId:'general', name:file.name });
        data.logoUrl = uploaded.url;
        data.logo = uploaded.url;
        data.r2Key = uploaded.key;
        data.logoStorage = 'r2';
        newlyUploadedKey = uploaded.key;
      }

      const cloud = cloudDataStatus();
      if (cloud.cutoverMode === 'cloud') {
        await commitOperationalChanges([{ entity:'clients', op:'upsert', row:data }]);
      } else if (account()?.cloudIdentity) {
        throw Object.assign(new Error('CLOUD_SYNC_UNAVAILABLE'), { code:'CLOUD_SYNC_UNAVAILABLE' });
      }

      const i = rows.findIndex((x) => x.id === id);
      i >= 0 ? (rows[i] = data) : rows.push(data);
      db.clients = rows;
      persistView(db);
      this.close();
      renderClients();
      window.showToast?.('Data klien tersimpan dan tersinkron.', 'success');
    } catch (error) {
      if (newlyUploadedKey) {
        window.R2?.deleteUploadedAsset?.(newlyUploadedKey).catch((cleanupError) => console.warn('client_logo_cleanup_failed', cleanupError?.message || cleanupError));
      }
      const message = {
        REVISION_CONFLICT:'Data berubah di server. Muat ulang data lalu coba simpan kembali.',
        CLIENT_NAME_REQUIRED:'Nama klien wajib diisi.',
        CLIENT_CODE_REQUIRED:'Kode klien wajib tersedia.',
        CLIENT_NAME_CONFLICT:'Nama klien sudah terdaftar.',
        CLIENT_LEGAL_NAME_CONFLICT:'Nama legal klien sudah terdaftar.',
        CLIENT_CODE_CONFLICT:'Kode klien sudah digunakan.',
        CLIENT_INVALID_PERIOD:'Tanggal akhir kerja sama tidak boleh sebelum tanggal mulai.',
        CLIENT_INVALID_EMAIL:'Email PIC tidak valid.',
        CLOUD_SYNC_UNAVAILABLE:'Sinkronisasi cloud belum siap. Data belum disimpan.',
        CLOUD_SYNC_BUSY:'Sinkronisasi sedang berjalan. Coba simpan kembali.',
        UPLOAD_UNAVAILABLE:'Layanan upload logo belum tersedia.',
      }[error?.code || error?.message] || error?.message || 'Data klien gagal disimpan.';
      window.showToast?.(message, 'error');
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  },
  viewClient(id) {
    if (!canManage()) return;
    const db = viewDB(),
      c = db.clients.find((x) => x.id === id),
      projects = db.projects.filter((p) => p.clientId === id);
    if (!c) return;
    const website = normalizeClientWebsite(c.website);
    modal(
      c.name,
      `<div class="pm-detail-grid">
        ${c.logoUrl || c.logo ? `<div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Logo</div><img src="${esc(c.logoUrl || c.logo)}" alt="Logo ${esc(c.name)}" style="max-width:160px;max-height:72px;object-fit:contain;margin-top:8px"></div>` : ""}
        <div class="pm-detail-card"><div class="pm-detail-label">Nama Legal</div><div class="pm-detail-value">${esc(c.legalName || "-")}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Industri / Status</div><div class="pm-detail-value">${esc(c.industry || "-")} · <span class="pm-badge ${esc(c.status)}">${esc(clientStatusLabel(c.status))}</span></div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">NPWP / SIUP</div><div class="pm-detail-value">${esc(c.npwp || "-")}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Website</div><div class="pm-detail-value">${website ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">${esc(c.website)}</a>` : "-"}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Lokasi</div><div class="pm-detail-value">${esc(c.address || "-")}\n${esc([c.city,c.province].filter(Boolean).join(", ") || "-")}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Periode Kerja Sama</div><div class="pm-detail-value">${dateLabel(c.cooperationStart)} – ${dateLabel(c.cooperationEnd)}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">PIC Utama</div><div class="pm-detail-value">${esc(c.picName || "-")}\n${esc(c.picRole || "")}\n${esc(c.picPhone || "")}${c.picEmail ? ` · ${esc(c.picEmail)}` : ""}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">PIC Tambahan</div><div class="pm-detail-value">${(c.additionalPics || []).map((p) => `${esc(p.name || "-")} — ${esc(p.role || "")}<br><span class="pm-subtext">${esc(p.phone || "")}${p.email ? ` · ${esc(p.email)}` : ""}</span>`).join("<br>") || "-"}</div></div>
        <div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Project Terhubung</div><div class="pm-detail-value">${projects.map((p) => `<span class="pm-project-chip">${esc(p.code)} — ${esc(p.name)}</span>`).join("") || "-"}</div></div>
        <div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Catatan</div><div class="pm-detail-value">${esc(c.notes || "-")}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Dibuat</div><div class="pm-detail-value">${dateLabel(c.createdAt)}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Terakhir diperbarui</div><div class="pm-detail-value">${dateLabel(c.updatedAt)}</div></div>
      </div>`,
    );
  },
  openProject(id = "") {
    if (!canManage() || (!id && !canCreateProject())) return;
    const db = viewDB(),
      p = (db.projects || []).find((x) => x.id === id) || {};
    if (!db.clients?.length) {
      alert("Tambahkan klien terlebih dahulu sebelum membuat project.");
      return;
    }
    modal(
      id ? "Edit Project" : "Tambah Project",
      `<form class="pm-form" data-pqt-onsubmit="PM.saveProject(event,'${id}')"><div class="full"><label class="label">Nama Project</label><input class="input" name="name" value="${esc(p.name || "")}" required></div><div><label class="label">Klien</label>${canCreateProject() ? `<select class="select" name="clientId" required>${db.clients.map((c) => `<option value="${c.id}" ${p.clientId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>` : `<input type="hidden" name="clientId" value="${esc(p.clientId || "")}"><select class="select" disabled aria-label="Klien project">${db.clients.filter((c) => c.id === p.clientId).map((c) => `<option selected>${esc(c.name)}</option>`).join("")}</select>`}</div><div><label class="label">Kode Internal</label><input class="input" name="code" value="${esc(p.code || "")}" required></div><div class="full"><label class="label">Description / SoW</label><textarea class="textarea" style="min-height:130px" name="description" required>${esc(p.description || "")}</textarea></div><div><label class="label">Mulai</label><input class="input" type="date" name="startDate" value="${esc(p.startDate || "")}" required></div><div><label class="label">Selesai</label><input class="input" type="date" name="endDate" value="${esc(p.endDate || "")}" required></div><div><label class="label">Status</label><select class="select" name="status">${["draft", "active", "on_hold", "completed", "cancelled"].map((x) => `<option value="${x}" ${p.status === x ? "selected" : ""}>${esc(projectStatusLabel(x))}</option>`).join("")}</select></div><div><label class="label">Nilai Kontrak</label><input class="input" type="number" min="0" name="contractValue" value="${p.contractValue || ""}"></div><div><label class="label">Target Visit</label><input class="input" type="number" min="0" name="targetVisits" value="${p.targetVisits || ""}"></div><div><label class="label">Target Outlet</label><input class="input" type="number" min="0" name="targetOutlets" value="${p.targetOutlets || ""}"></div><div><label class="label">Outlet Approval</label><select class="select" name="outletApprovalMode"><option value="auto" ${p.outletApprovalMode !== "manual" ? "selected" : ""}>Auto Approved</option><option value="manual" ${p.outletApprovalMode === "manual" ? "selected" : ""}>Manual Approval</option></select><div class="pm-subtext">Default Auto Approved. Gunakan Manual hanya bila project membutuhkan approval.</div></div><div><label class="label">Sumber Attendance</label><select class="select" name="attendanceSourceMode"><option value="manual" ${p.attendanceSourceMode !== "visit" ? "selected" : ""}>Manual Check-in</option><option value="visit" ${p.attendanceSourceMode === "visit" ? "selected" : ""}>Otomatis dari Visit</option></select><div class="pm-subtext">Visit mode membuat attendance saat check-in kunjungan valid.</div></div><div><label class="label">Batas Terlambat</label><input class="input" type="time" name="attendanceLateAfter" value="${esc(p.attendanceLateAfter || "09:00")}" required></div><div class="full"><label class="label">Coverage Area</label><input class="input" name="region" value="${esc(p.region || "")}"></div><div class="full"><label class="label">Catatan</label><textarea class="textarea" name="notes">${esc(p.notes || "")}</textarea></div><div class="full"><button class="btn btn-primary btn-block">Simpan Project</button></div></form>`,
    );
  },
  async saveProject(e, id) {
    e.preventDefault();
    if (!canManage() || (!id && !canCreateProject())) return;
    const db = viewDB(),
      fd = new FormData(e.target),
      rows = db.projects || [],
      old = rows.find((x) => x.id === id),
      code = formValue(fd, "code");
    const clientId = formValue(fd, "clientId");
    const startDate = formValue(fd, "startDate");
    const endDate = formValue(fd, "endDate");
    if (!db.clients.some((x) => x.id === clientId)) {
      alert("Klien project tidak valid.");
      return;
    }
    if (endDate < startDate) {
      alert("Tanggal selesai project tidak boleh sebelum tanggal mulai.");
      return;
    }
    const nextStatus = formValue(fd, "status");
    if (old && ['completed','cancelled'].includes(nextStatus) && old.status !== nextStatus) {
      const deps = projectDependencies(db, old.id);
      if (deps.total > 0) {
        const detail = [
          deps.assignments ? `${deps.assignments} assignment aktif` : '',
          deps.openVisits ? `${deps.openVisits} visit belum final` : '',
          deps.draftSurveys ? `${deps.draftSurveys} survey draft` : '',
        ].filter(Boolean).join(', ');
        if (!window.confirm(`Project masih memiliki dependency: ${detail}. Lanjutkan perubahan status menjadi ${projectStatusLabel(nextStatus)}?`)) return;
      }
    }
    if (
      rows.some(
        (x) => x.code.toLowerCase() === code.toLowerCase() && x.id !== id,
      )
    ) {
      alert("Kode project harus unik.");
      return;
    }
    const data = {
      id: id || uid("PRJ"),
      organizationId: old?.organizationId || currentOrgId(),
      clientId,
      name: formValue(fd, "name"),
      code,
      description: formValue(fd, "description"),
      startDate,
      endDate,
      status: formValue(fd, "status"),
      contractValue: Number(fd.get("contractValue") || 0) || null,
      targetVisits: Number(fd.get("targetVisits") || 0) || null,
      targetOutlets: Number(fd.get("targetOutlets") || 0) || null,
      outletApprovalMode: formValue(fd, "outletApprovalMode") === "manual" ? "manual" : "auto",
      attendanceSourceMode: formValue(fd, "attendanceSourceMode") === "visit" ? "visit" : "manual",
      attendanceLateAfter: formValue(fd, "attendanceLateAfter") || "09:00",
      region: formValue(fd, "region"),
      notes: formValue(fd, "notes"),
      modules: { ...defaultModules(), ...(old?.modules || db.projectSettings.find((s) => s.projectId === (id || ""))?.modules || {}) },
      createdAt: old?.createdAt || now(),
      updatedAt: now(),
    };
    const submit = e.target.querySelector('button[type="submit"], button:not([type])');
    if (submit) submit.disabled = true;
    try {
      const cloud = cloudDataStatus();
      const closingAssignments = old && old.status !== data.status
        ? closingProjectAssignments(db.projectAssignments || [], data.id, data.status, account()?.id || '', now())
        : [];
      const authoritativeChanges = [
        { entity:'projects', op:'upsert', row:data },
        ...closingAssignments.map((row) => ({ entity:'projectAssignments', op:'upsert', row })),
      ];
      if (cloud.cutoverMode === 'cloud') {
        await commitOperationalChanges(authoritativeChanges);
      } else if (account()?.cloudIdentity) {
        throw Object.assign(new Error('CLOUD_SYNC_UNAVAILABLE'), { code:'CLOUD_SYNC_UNAVAILABLE' });
      }

      const i = rows.findIndex((x) => x.id === id);
      i >= 0 ? (rows[i] = data) : rows.push(data);
      db.projects = rows;
      if (closingAssignments.length) {
        const closedById = new Map(closingAssignments.map((assignment) => [assignment.id, assignment]));
        db.projectAssignments = (db.projectAssignments || []).map((assignment) => closedById.get(assignment.id) || assignment);
      }
      if (!db.projectSettings.some((s) => s.projectId === data.id)) {
        db.projectSettings.push({
          projectId: data.id,
          organizationId: data.organizationId,
          modules: defaultModules(),
          updatedAt: now(),
          updatedBy: account()?.id,
        });
      }
      persistView(db);
      this.close();
      renderProjects(false);
      window.showToast?.(closingAssignments.length ? `Project tersimpan; ${closingAssignments.length} assignment aktif ditutup.` : 'Project tersimpan dan tersinkron.', 'success');
    } catch (error) {
      const message = {
        REVISION_CONFLICT:'Data berubah di server. Muat ulang data lalu coba simpan kembali.',
        PROJECT_NAME_REQUIRED:'Nama project wajib diisi.',
        PROJECT_CODE_REQUIRED:'Kode project wajib diisi.',
        PROJECT_CLIENT_REQUIRED:'Klien project wajib dipilih.',
        PROJECT_CLIENT_NOT_FOUND:'Klien project tidak ditemukan atau tidak valid.',
        PROJECT_PERIOD_REQUIRED:'Periode project wajib diisi.',
        PROJECT_INVALID_PERIOD:'Tanggal selesai project tidak boleh sebelum tanggal mulai.',
        PROJECT_CODE_CONFLICT:'Kode project harus unik.',
        PROJECT_INVALID_STATUS:'Status project tidak valid.',
        PROJECT_INVALID_TRANSITION:'Perubahan status project tidak diizinkan.',
        PROJECT_ACTIVE_ASSIGNMENTS_REMAIN:'Project belum dapat difinalkan karena masih ada assignment aktif.',
        PROJECT_INVALID_CONTRACT_VALUE:'Nilai kontrak tidak valid.',
        PROJECT_INVALID_TARGET_VISITS:'Target visit tidak valid.',
        PROJECT_INVALID_TARGET_OUTLETS:'Target outlet tidak valid.',
        PROJECT_INVALID_ATTENDANCE_SOURCE:'Sumber attendance project tidak valid.',
        PROJECT_INVALID_ATTENDANCE_CUTOFF:'Batas waktu terlambat tidak valid.',
        PROJECT_ATTENDANCE_SOURCE_IN_USE:'Sumber attendance tidak dapat diubah karena attendance hari ini sudah tercatat.',
        CHANGE_FORBIDDEN:'Anda tidak memiliki izin untuk mengubah project ini.',
        CLOUD_SYNC_UNAVAILABLE:'Sinkronisasi cloud belum siap. Project belum disimpan.',
        CLOUD_SYNC_BUSY:'Sinkronisasi sedang berjalan. Coba simpan kembali.',
      }[error?.code || error?.message] || error?.message || 'Project gagal disimpan.';
      window.showToast?.(message, 'error');
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  },
  viewProject(id) {
    const db = viewDB(),
      p = db.projects.find((x) => x.id === id),
      client = db.clients.find((x) => x.id === p?.clientId),
      assignments = (db.projectAssignments || []).filter((a) => a.projectId === id),
      set = { modules:{ ...defaultModules(), ...(p?.modules || db.projectSettings.find((s) => s.projectId === id)?.modules || {}) } },
      employeeMap = Object.fromEntries((db.employees || []).map((e) => [e.id,e]));
    if (!p || (!canManage() && !accessibleProjectIds().has(id))) return;
    const activeAssignments = assignments.filter((a) => a.status === 'active');
    const managers = projectManagerNames(db,id);
    const supervisors = projectSupervisorNames(db,id);
    const deps = projectDependencies(db,id);
    modal(
      `${p.code} — ${p.name}`,
      `<div class="pm-tabs"><button class="pm-tab active">Ringkasan</button>${canManage() ? `<button class="pm-tab" data-pqt-onclick="PM.openAssign('${id}')">Kelola Assignment</button>` : ""}</div>
      <div class="pm-detail-grid">
        <div class="pm-detail-card"><div class="pm-detail-label">Klien</div><div class="pm-detail-value">${esc(client?.name || "-")}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Status / Periode</div><div class="pm-detail-value"><span class="pm-badge ${esc(p.status)}">${esc(projectStatusLabel(p.status))}</span><br>${dateLabel(p.startDate)} – ${dateLabel(p.endDate)}</div></div>
        ${canManage() ? `<div class="pm-detail-card"><div class="pm-detail-label">Nilai Kontrak</div><div class="pm-detail-value">${money(p.contractValue)}</div></div>` : ""}
        <div class="pm-detail-card"><div class="pm-detail-label">Target</div><div class="pm-detail-value">${p.targetVisits || "-"} visit · ${p.targetOutlets || "-"} outlet</div></div><div class="pm-detail-card"><div class="pm-detail-label">Outlet Approval</div><div class="pm-detail-value">${p.outletApprovalMode === "manual" ? "Manual Approval" : "Auto Approved"}</div></div><div class="pm-detail-card"><div class="pm-detail-label">Attendance</div><div class="pm-detail-value">${p.attendanceSourceMode === "visit" ? "Otomatis dari Visit" : "Manual Check-in"} · terlambat setelah ${esc(p.attendanceLateAfter || "09:00")}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Manager</div><div class="pm-detail-value">${esc(managers.join(", ") || "—")}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Supervisor</div><div class="pm-detail-value">${esc(supervisors.join(", ") || "—")}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Coverage Area</div><div class="pm-detail-value">${esc(p.region || "-")}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Dependency Aktif</div><div class="pm-detail-value">${deps.assignments} assignment · ${deps.openVisits} visit terbuka · ${deps.draftSurveys} survey draft</div></div>
        <div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Statement of Work</div><div class="pm-detail-value">${esc(p.description || "-")}</div></div>
        <div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Catatan</div><div class="pm-detail-value">${esc(p.notes || "-")}</div></div>
        <div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Assignment Aktif</div><div class="pm-detail-value">${activeAssignments.map((a) => `${esc(employeeMap[a.employeeId]?.name || a.employeeId)} ${statusBadge(a.roleOnProject)}`).join("<br>") || "-"}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Dibuat</div><div class="pm-detail-value">${dateLabel(p.createdAt)}</div></div>
        <div class="pm-detail-card"><div class="pm-detail-label">Terakhir diperbarui</div><div class="pm-detail-value">${dateLabel(p.updatedAt)}</div></div>
        <div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Modul Field Aktif</div><div class="pm-modules" style="margin-top:10px">${ALL_MODULES.map((m) => `<label class="pm-module"><span>${esc(MODULE_LABELS[m])}</span><input type="checkbox" ${set.modules?.[m] !== false ? "checked" : ""} ${canManage() ? "" : "disabled"} data-pqt-onchange="PM.setModule('${id}','${m}',this.checked)"></label>`).join("")}</div></div>
      </div>`,
    );
  },
  async setModule(projectId, module, value) {
    if (!canManage() || !ALL_MODULES.includes(module)) return;
    const db = viewDB();
    const project = db.projects.find((x) => x.id === projectId);
    if (!project || (!canManage() && !accessibleProjectIds().has(projectId))) return;
    const nextModules = { ...defaultModules(), ...(project.modules || db.projectSettings.find((s) => s.projectId === projectId)?.modules || {}), [module]: !!value };
    const nextProject = { ...project, modules: nextModules, updatedAt: now() };
    try {
      const cloud = cloudDataStatus();
      if (cloud.cutoverMode === 'cloud') {
        await commitOperationalChanges([{ entity:'projects', op:'upsert', row:nextProject }]);
      } else if (account()?.cloudIdentity) {
        throw Object.assign(new Error('CLOUD_SYNC_UNAVAILABLE'), { code:'CLOUD_SYNC_UNAVAILABLE' });
      }
      Object.assign(project, nextProject);
      let s = db.projectSettings.find((x) => x.projectId === projectId);
      if (!s) {
        s = { projectId, organizationId:currentOrgId(), modules:defaultModules() };
        db.projectSettings.push(s);
      }
      s.organizationId ||= currentOrgId();
      s.modules = nextModules;
      s.updatedAt = nextProject.updatedAt;
      s.updatedBy = account()?.id;
      persistView(db);
      applyModuleVisibility();
      window.showToast?.('Pengaturan modul project tersimpan.', 'success');
    } catch (error) {
      window.showToast?.({
        REVISION_CONFLICT:'Data project berubah di server. Muat ulang lalu coba kembali.',
        PROJECT_INVALID_TRANSITION:'Status project tidak mengizinkan perubahan ini.',
        CHANGE_FORBIDDEN:'Anda tidak memiliki izin untuk mengubah project ini.',
        CLOUD_SYNC_UNAVAILABLE:'Sinkronisasi cloud belum siap.',
        CLOUD_SYNC_BUSY:'Sinkronisasi sedang berjalan. Coba kembali.',
      }[error?.code || error?.message] || 'Pengaturan modul project gagal disimpan.', 'error');
      const checkbox = document.querySelector(`input[data-pqt-onchange*="PM.setModule('${projectId}','${module}'"]`);
      if (checkbox) checkbox.checked = !value;
    }
  },
  openAssignmentCreate() {
    if (!canManage()) return;
    const db = viewDB(), ids = accessibleProjectIds();
    const projects = (db.projects || []).filter((project) =>
      ['active','draft'].includes(project.status) &&
      (role() === 'manager' || ids.has(project.id))
    );
    modal(
      'Tambah Assignment',
      `<div class="pm-form"><div class="full"><label class="label">Project</label><select class="select" id="assignmentCreateProject" required><option value="">Pilih project</option>${projects.map((project) => `<option value="${project.id}">${esc(project.code)} — ${esc(project.name)}</option>`).join('')}</select></div><div class="full"><button class="btn btn-primary btn-block" data-pqt-onclick="PM.openSelectedAssignmentProject()">Lanjutkan</button></div></div>`
    );
  },
  openSelectedAssignmentProject() {
    const projectId = String(document.getElementById('assignmentCreateProject')?.value || '');
    if (!projectId) {
      window.showToast?.('Pilih project terlebih dahulu.', 'error');
      return;
    }
    this.openAssign(projectId);
  },
  assignmentPage(delta) {
    assignmentPage = Math.max(1, assignmentPage + Number(delta || 0));
    this.filterAssignments(assignmentPage);
  },
  filterAssignments(page = assignmentPage) {
    const filters = {
      search:String(document.getElementById("assignmentSearch")?.value || ""),
      projectId:String(document.getElementById("assignmentProjectFilter")?.value || ""),
      status:String(document.getElementById("assignmentStatusFilter")?.value || ""),
      role:String(document.getElementById("assignmentRoleFilter")?.value || ""),
    };
    const rows = [...document.querySelectorAll("#assignmentRows tr")];
    const matched = rows.filter((row) => assignmentMatchesFilters({
      search:row.dataset.search || '',
      projectId:row.dataset.project || '',
      status:row.dataset.status || '',
      roleOnProject:row.dataset.role || '',
    }, filters));
    const pageState = paginateAssignments(matched, page, ASSIGNMENT_PAGE_SIZE);
    assignmentPage = pageState.currentPage;
    const visible = new Set(pageState.items);
    rows.forEach((row) => { row.style.display = visible.has(row) ? "" : "none"; });
    const summary = document.getElementById("assignmentResultSummary");
    if (summary) summary.textContent = pageState.total ? `Menampilkan ${pageState.from}–${pageState.to} dari ${pageState.total} assignment` : "Tidak ada assignment yang sesuai dengan filter.";
    const empty = document.getElementById("assignmentEmpty");
    if (empty) empty.hidden = pageState.total !== 0;
    const pager = document.getElementById("assignmentPager");
    if (pager) pager.hidden = pageState.total <= ASSIGNMENT_PAGE_SIZE;
    const label = document.getElementById("assignmentPageLabel");
    if (label) label.textContent = `Halaman ${pageState.currentPage} / ${pageState.pageCount}`;
    const sync = document.getElementById("assignmentSyncState");
    if (sync) sync.innerHTML = assignmentSyncLabel();
  },
  viewAssignment(id) {
    const db = viewDB(), assignment = db.projectAssignments.find((row) => row.id === id);
    if (!assignment) return;
    if (role() === "project-manager" && !accessibleProjectIds().has(assignment.projectId)) return;
    const project = db.projects.find((row) => row.id === assignment.projectId),
      client = db.clients.find((row) => row.id === project?.clientId),
      employee = db.employees.find((row) => row.id === assignment.employeeId),
      supervisor = db.employees.find((row) => row.id === assignment.supervisorId),
      actor = db.accounts.find((row) => row.id === assignment.assignedBy),
      endActor = db.accounts.find((row) => row.id === assignment.endedBy),
      normalizedStatus = normalizeAssignmentStatus(assignment.status);
    modal(`Assignment — ${employee?.name || assignment.employeeId}`, `<div class="pm-detail-grid">
      <div class="pm-detail-card"><div class="pm-detail-label">Project</div><div class="pm-detail-value">${esc(project?.name || assignment.projectId)}<br><span class="pm-subtext">${esc(project?.code || '')}</span></div></div>
      <div class="pm-detail-card"><div class="pm-detail-label">Klien</div><div class="pm-detail-value">${esc(client?.name || '-')}</div></div>
      <div class="pm-detail-card"><div class="pm-detail-label">Karyawan</div><div class="pm-detail-value">${esc(employee?.name || assignment.employeeId)}<br><span class="pm-subtext">${esc(employee?.employeeCode || employee?.code || '')}</span></div></div>
      <div class="pm-detail-card"><div class="pm-detail-label">Role</div><div class="pm-detail-value">${esc(assignmentRoleLabel(assignment.roleOnProject))}</div></div>
      <div class="pm-detail-card"><div class="pm-detail-label">Supervisor</div><div class="pm-detail-value">${esc(supervisor?.name || (assignment.roleOnProject === 'supervisor' ? '—' : '-'))}</div></div>
      <div class="pm-detail-card"><div class="pm-detail-label">Status</div><div class="pm-detail-value"><span class="pm-badge ${esc(normalizedStatus)}">${esc(assignmentStatusLabel(normalizedStatus))}</span></div></div>
      <div class="pm-detail-card"><div class="pm-detail-label">Periode</div><div class="pm-detail-value">${dateLabel(assignment.startDate)} – ${dateLabel(assignment.endDate)}</div></div>
      <div class="pm-detail-card"><div class="pm-detail-label">Alokasi Kapasitas</div><div class="pm-detail-value">${Number(assignment.allocationPercent || 100)}%</div></div>
      <div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Alasan / Cakupan Kerja</div><div class="pm-detail-value">${esc(assignment.notes || '-')}</div></div>
      <div class="pm-detail-card"><div class="pm-detail-label">Ditugaskan</div><div class="pm-detail-value">${dateLabel(assignment.assignedAt)}<br><span class="pm-subtext">${esc(actor?.name || actor?.email || assignment.assignedBy || '-')}</span></div></div>
      <div class="pm-detail-card"><div class="pm-detail-label">Diakhiri</div><div class="pm-detail-value">${assignment.endedAt ? dateLabel(assignment.endedAt) : '-'}<br><span class="pm-subtext">${esc(endActor?.name || endActor?.email || assignment.endedBy || '')}</span></div></div>
    </div>`);
  },
  refreshAssignmentCapacity() {
    const form = document.querySelector('#pmModal form');
    if (!form) return;
    const db = viewDB();
    const employeeId = String(form.elements.employeeId?.value || '');
    const startDate = String(form.elements.startDate?.value || '');
    const endDate = String(form.elements.endDate?.value || '');
    const requested = Number(form.elements.allocationPercent?.value || 0);
    const roleOnProject = String(form.elements.roleOnProject?.value || 'supervisor');
    const supervisorSelect = form.elements.supervisorId;
    const projectId = String(form.dataset.projectId || '');
    const hint = document.getElementById('assignmentCapacityHint');
    if (hint && employeeId && startDate && endDate) {
      const used = employeeCapacityUsage(db.projectAssignments || [], employeeId, startDate, endDate);
      const available = Math.max(0, 100 - used);
      hint.textContent = `Terpakai ${used}% · Tersedia ${available}% · Permintaan ${Number.isFinite(requested) ? requested : 0}%`;
      hint.classList.toggle('pm-sync-error', Number.isFinite(requested) && requested > available);
    }
    if (supervisorSelect) {
      const previous = String(supervisorSelect.value || '');
      const supervisors = eligibleSupervisors(db.projectAssignments || [], db.employees || [], projectId, startDate, endDate);
      supervisorSelect.innerHTML = '<option value="">Pilih untuk sales/viewer</option>' + supervisors
        .map((employee) => `<option value="${esc(employee.id)}">${esc(employee.name)}</option>`)
        .join('');
      supervisorSelect.disabled = roleOnProject === 'supervisor';
      if (roleOnProject === 'supervisor') supervisorSelect.value = '';
      else if (supervisors.some((employee) => employee.id === previous)) supervisorSelect.value = previous;
    }
  },
  openAssign(projectId) {
    if (!canManage()) return;
    const db = viewDB(),
      p = db.projects.find((x) => x.id === projectId),
      active = db.projectAssignments.filter(
        (a) => a.projectId === projectId && a.status === "active",
      );
    if (!p || (role() === "project-manager" && !accessibleProjectIds().has(projectId))) return;
    const staffingScope = role() === "project-manager"
      ? new Set(scopedEmployees().map((employee) => employee.id))
      : null;
    const eligible = eligibleAssignmentEmployees(db.employees || [], db.accounts || [], staffingScope);
    modal(
      `Assignment — ${p?.name || projectId}`,
      `<form class="pm-form" data-project-id="${projectId}" data-pqt-onsubmit="PM.saveAssignment(event,'${projectId}')"><div class="full"><label class="label">Karyawan aktif dengan akun login</label><select class="select" name="employeeId" required data-pqt-onchange="PM.refreshAssignmentCapacity()">${eligible.map((employee) => `<option value="${employee.id}">${esc(employee.name)} — ${esc(employee.role)}</option>`).join("")}</select></div><div><label class="label">Role pada Project</label><select class="select" name="roleOnProject" data-pqt-onchange="PM.refreshAssignmentCapacity()"><option value="supervisor">Supervisor</option><option value="sales">Field Sales</option><option value="viewer">Viewer</option></select></div><div><label class="label">Supervisor Project</label><select class="select" name="supervisorId" disabled><option value="">Pilih untuk sales/viewer</option></select></div><div><label class="label">Mulai Assignment</label><input class="input" type="date" name="startDate" min="${p.startDate}" max="${p.endDate}" value="${p.startDate}" required data-pqt-onchange="PM.refreshAssignmentCapacity()"></div><div><label class="label">Selesai Assignment</label><input class="input" type="date" name="endDate" min="${p.startDate}" max="${p.endDate}" value="${p.endDate}" required data-pqt-onchange="PM.refreshAssignmentCapacity()"></div><div><label class="label">Alokasi Kapasitas (%)</label><input class="input" type="number" name="allocationPercent" min="1" max="100" value="100" required data-pqt-oninput="PM.refreshAssignmentCapacity()"><div id="assignmentCapacityHint" class="pm-subtext" style="margin-top:6px">Terpakai 0% · Tersedia 100% · Permintaan 100%</div></div><div><label class="label">Alasan / cakupan kerja</label><input class="input" name="notes" required placeholder="Contoh: coverage Jakarta Selatan"></div><div class="full"><button class="btn btn-primary btn-block">Validasi & Assign</button></div></form><div style="margin-top:18px"><div class="card-title">Assignment aktif</div>${
        active
          .map((a) => {
            const e = db.employees.find((x) => x.id === a.employeeId);
            return `<div class="pm-module"><span><strong>${esc(e?.name || a.employeeId)}</strong><br><small>${esc(assignmentRoleLabel(a.roleOnProject))} · ${a.allocationPercent || 0}% · ${dateLabel(a.startDate)}–${dateLabel(a.endDate)}</small></span><button class="btn btn-secondary btn-sm" data-pqt-onclick="PM.toggleAssignment('${a.id}')">Unassign</button></div>`;
          })
          .join("") ||
        '<div style="padding:34px;text-align:center;color:#94a3b8">Belum ada assignment.</div>'
      }</div>`,
    );
    queueMicrotask(() => this.refreshAssignmentCapacity());
  },
  async saveAssignment(e, projectId) {
    e.preventDefault();
    if (!canManage() || (role() === "project-manager" && !accessibleProjectIds().has(projectId))) return;
    const db = viewDB(),
      fd = new FormData(e.target),
      employeeId = formValue(fd, "employeeId"),
      roleOnProject = formValue(fd, "roleOnProject");
    const project = db.projects.find((x) => x.id === projectId);
    const emp = db.employees.find((x) => x.id === employeeId);
    if (role() === "project-manager" && !scopedEmployees().some((employee) => employee.id === employeeId)) {
      window.showToast?.("Karyawan berada di luar staffing scope Anda.", "error");
      return;
    }
    if (!project || !emp) {
      window.showToast?.("Project atau karyawan tidak valid.", "error");
      return;
    }
    if (db.projectAssignments.some((a) => a.projectId === projectId && a.employeeId === employeeId && a.status === "active")) {
      window.showToast?.("Karyawan sudah memiliki assignment aktif pada project ini.", "error");
      return;
    }
    if (!["supervisor", "sales", "viewer"].includes(roleOnProject)) {
      window.showToast?.("Role project tidak valid.", "error");
      return;
    }
    if (emp.status !== "active") {
      window.showToast?.("Karyawan nonaktif tidak dapat di-assign.", "error");
      return;
    }
    const user = db.accounts.find((a) => a.employeeId === employeeId);
    if (!user || user.status === "inactive") {
      window.showToast?.("Karyawan harus memiliki akun login aktif sebelum di-assign.", "error");
      return;
    }
    if (!["active", "draft"].includes(project.status)) {
      window.showToast?.("Assignment hanya dapat dibuat untuk project draft atau aktif.", "error");
      return;
    }
    const startDate = formValue(fd, "startDate");
    const endDate = formValue(fd, "endDate");
    const allocationPercent = Number(fd.get("allocationPercent"));
    if (startDate < project.startDate || endDate > project.endDate || endDate < startDate) {
      window.showToast?.("Periode assignment harus berada di dalam periode project.", "error");
      return;
    }
    if (!Number.isFinite(allocationPercent) || allocationPercent < 1 || allocationPercent > 100) {
      window.showToast?.("Alokasi kapasitas harus 1–100%.", "error");
      return;
    }
    const allocated = db.projectAssignments
      .filter((a) => a.employeeId === employeeId && a.status === "active" && a.startDate <= endDate && a.endDate >= startDate)
      .reduce((sum, a) => sum + Number(a.allocationPercent || 100), 0);
    if (allocated + allocationPercent > 100) {
      window.showToast?.(`Kapasitas bentrok. Periode tersebut sudah teralokasi ${allocated}%.`, "error");
      return;
    }
    const supervisorId = formValue(fd, "supervisorId");
    if (supervisorId === employeeId) {
      window.showToast?.("Karyawan tidak dapat menjadi supervisor untuk dirinya sendiri.", "error");
      return;
    }
    const supervisorEmployee = db.employees.find((employee) => employee.id === supervisorId);
    if (
      roleOnProject !== "supervisor" &&
      !db.projectAssignments.some(
        (a) =>
          a.projectId === projectId &&
          a.employeeId === supervisorId &&
          a.roleOnProject === "supervisor" &&
          a.status === "active" &&
          a.startDate <= startDate &&
          a.endDate >= endDate,
      )
    ) {
      window.showToast?.("Sales/viewer wajib memiliki supervisor aktif yang mencakup seluruh periode assignment.", "error");
      return;
    }
    const timestamp = now();
    const row = {
      id: uid("ASN"),
      projectId,
      employeeId,
      organizationId: currentOrgId(),
      roleOnProject,
      positionName: roleOnProject,
      supervisorId: roleOnProject === "supervisor" ? null : supervisorId,
      supervisorUserId: roleOnProject === "supervisor" ? null : (supervisorEmployee?.authUserId || null),
      startDate,
      endDate,
      allocationPercent,
      notes: formValue(fd, "notes"),
      status: "active",
      assignedAt: timestamp,
      assignedBy: account()?.id,
      updatedAt: timestamp,
    };
    const submit = e.target.querySelector('button[type="submit"], button:not([type])');
    if (submit) submit.disabled = true;
    try {
      const cloud = cloudDataStatus();
      if (cloud.cutoverMode === 'cloud') {
        await commitOperationalChanges([{ entity:'projectAssignments', op:'upsert', row }]);
      } else if (account()?.cloudIdentity) {
        throw Object.assign(new Error('CLOUD_SYNC_UNAVAILABLE'), { code:'CLOUD_SYNC_UNAVAILABLE' });
      }
      db.projectAssignments.push(row);
      persistView(db);
      window.showToast?.("Assignment tersimpan dan tersinkron.", "success");
      this.openAssign(projectId);
    } catch (error) {
      const message = {
        REVISION_CONFLICT:'Data berubah di server. Muat ulang data lalu coba kembali.',
        ASSIGNMENT_PROJECT_NOT_FOUND:'Project tidak ditemukan.',
        ASSIGNMENT_PROJECT_NOT_ASSIGNABLE:'Project tidak menerima assignment baru.',
        ASSIGNMENT_EMPLOYEE_NOT_FOUND:'Karyawan tidak ditemukan.',
        ASSIGNMENT_EMPLOYEE_INACTIVE:'Karyawan tidak aktif.',
        ASSIGNMENT_EMPLOYEE_LOGIN_REQUIRED:'Karyawan harus memiliki akun login aktif.',
        ASSIGNMENT_INVALID_ROLE:'Role project tidak valid.',
        ASSIGNMENT_INVALID_PERIOD:'Periode assignment tidak valid.',
        ASSIGNMENT_INVALID_ALLOCATION:'Alokasi kapasitas harus 1–100%.',
        ASSIGNMENT_ACTIVE_DUPLICATE:'Karyawan sudah memiliki assignment aktif pada project ini.',
        ASSIGNMENT_CAPACITY_CONFLICT:'Kapasitas karyawan melebihi 100% pada periode tersebut.',
        ASSIGNMENT_SUPERVISOR_REQUIRED:'Supervisor wajib dipilih.',
        ASSIGNMENT_SELF_SUPERVISION:'Karyawan tidak dapat menjadi supervisor dirinya sendiri.',
        ASSIGNMENT_SUPERVISOR_INVALID:'Supervisor tidak valid atau tidak aktif.',
        ASSIGNMENT_SUPERVISOR_NOT_COVERING_PERIOD:'Supervisor harus aktif sepanjang periode assignment.',
        CHANGE_FORBIDDEN:'Anda tidak memiliki akses ke project ini.',
        CLOUD_SYNC_UNAVAILABLE:'Sinkronisasi cloud belum siap. Assignment belum disimpan.',
        CLOUD_SYNC_BUSY:'Sinkronisasi sedang berjalan. Coba kembali.',
      }[error?.code || error?.message] || error?.message || 'Assignment gagal disimpan.';
      window.showToast?.(message, "error");
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  },
  async toggleAssignment(id) {
    if (!canManage()) return;
    const db = viewDB(),
      assignment = db.projectAssignments.find((x) => x.id === id);
    if (!assignment || assignment.status !== "active") return;
    if (role() === "project-manager" && !accessibleProjectIds().has(assignment.projectId)) return;
    const timestamp = now();
    const next = {
      ...assignment,
      status:"ended",
      endedAt:timestamp,
      endedBy:account()?.id || null,
      updatedAt:timestamp,
    };
    try {
      const cloud = cloudDataStatus();
      if (cloud.cutoverMode === 'cloud') {
        await commitOperationalChanges([{ entity:'projectAssignments', op:'upsert', row:next }]);
      } else if (account()?.cloudIdentity) {
        throw Object.assign(new Error('CLOUD_SYNC_UNAVAILABLE'), { code:'CLOUD_SYNC_UNAVAILABLE' });
      }
      Object.assign(assignment,next);
      persistView(db);
      window.showToast?.("Assignment diakhiri.", "success");
      if (location.hash === "#/assignments") renderAssignments();
      else if (document.getElementById("pmModal")) this.openAssign(assignment.projectId);
    } catch (error) {
      window.showToast?.({
        REVISION_CONFLICT:'Data berubah di server. Muat ulang lalu coba kembali.',
        ASSIGNMENT_FINAL:'Assignment sudah berakhir dan tidak dapat diaktifkan kembali.',
        ASSIGNMENT_INVALID_TRANSITION:'Perubahan status assignment tidak diizinkan.',
        ASSIGNMENT_SUPERVISOR_HAS_ACTIVE_SUBORDINATES:'Supervisor belum dapat diakhiri karena masih memiliki Sales/Viewer aktif. Akhiri atau pindahkan subordinate terlebih dahulu.',
        CHANGE_FORBIDDEN:'Anda tidak memiliki akses untuk mengubah assignment ini.',
        CLOUD_SYNC_UNAVAILABLE:'Sinkronisasi cloud belum siap.',
        CLOUD_SYNC_BUSY:'Sinkronisasi sedang berjalan. Coba kembali.',
      }[error?.code || error?.message] || 'Assignment gagal diakhiri.', "error");
    }
  },
};
function enhanceDashboard() {
  if (!account() || PROJECT_ROUTES.has(location.hash)) return;
  const content = document.querySelector(".content");
  if (!content || content.querySelector("[data-pm-dashboard]")) return;
  const grid = content.querySelector(".grid-4,.grid-3,.grid-2");
  if (!grid) return;
  const db = viewDB();
  let cards = "";
  if (role() === "manager")
    cards = [
      [
        "Klien Aktif",
        db.clients.filter((x) => x.status === "active").length,
        "clients",
      ],
      [
        "Project Aktif",
        db.projects.filter((x) => x.status === "active").length,
        "projects",
      ],
      [
        "Assignment Aktif",
        db.projectAssignments.filter((x) => x.status === "active").length,
        "team",
      ],
    ]
      .map(
        ([l, v, i]) =>
          `<div class="stat-card" data-pm-dashboard="1"><div class="stat-icon bg-blue-50">${svg(i)}</div><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`,
      )
      .join("");
  if (role() === "supervisor") {
    const team = scopedEmployees().length - 1,
      ids = accessibleProjectIds().size;
    cards = `<div class="stat-card" data-pm-dashboard="1"><div class="stat-icon bg-blue-50">${svg("team")}</div><div class="stat-label">Tim Saya</div><div class="stat-value">${Math.max(0, team)}</div></div><div class="stat-card" data-pm-dashboard="1"><div class="stat-icon bg-blue-50">${svg("projects")}</div><div class="stat-label">Project Aktif</div><div class="stat-value">${ids}</div></div>`;
  }
  if (cards) grid.insertAdjacentHTML("beforeend", cards);
}
function enhanceProjectSelector() {
  if (!account() || role() === "manager") return;
  const ids = [...accessibleProjectIds()];
  if (!ids.length) return;
  document.querySelectorAll(".modal-body form,.modal form").forEach((form) => {
    if (form.dataset.pmProject || form.querySelector('[name="projectId"]'))
      return;
    const txt = (
      form.closest(".modal")?.textContent ||
      form.textContent ||
      ""
    ).toLowerCase();
    if (!/(kunjungan|visit|intel|kompetitor|foto|harga|stok)/.test(txt)) return;
    const db = viewDB(),
      projects = db.projects.filter((p) => ids.includes(p.id));
    const wrap = document.createElement("div");
    wrap.className = "pm-project-selector";
    wrap.innerHTML = `<label class="label">Project</label><select class="select" name="projectId" required>${projects.map((p) => `<option value="${p.id}">${esc(p.code)} — ${esc(p.name)}</option>`).join("")}</select>`;
    form.prepend(wrap);
    form.dataset.pmProject = "1";
  });
}
function sync() {
  injectStyles();
  ensureNav();
  const content = document.querySelector(".content");
  const routeAlreadyRendered =
    PROJECT_ROUTES.has(location.hash) &&
    content?.dataset.pmRoute === location.hash;
  if (!routeAlreadyRendered && !renderRoute()) {
    applyModuleVisibility();
    enhanceDashboard();
    enhanceProjectSelector();
  }
}
let syncQueued = false;
function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    sync();
  });
}
window.addEventListener("hashchange", scheduleSync);
window.addEventListener("storage", scheduleSync);
window.addEventListener("proqtrack:db-persisted", () => {
  if (PROJECT_ROUTES.has(location.hash)) scheduleSync();
});
window.addEventListener("proqtrack:cloud-status", () => {
  if (location.hash === "#/clients") {
    const target = document.getElementById("clientSyncState");
    if (target) target.innerHTML = clientSyncLabel();
  }
  if (["#/projects","#/my-projects"].includes(location.hash)) {
    const target = document.getElementById("projectSyncState");
    if (target) target.innerHTML = projectSyncLabel();
  }
  if (location.hash === "#/assignments") {
    const target = document.getElementById("assignmentSyncState");
    if (target) target.innerHTML = assignmentSyncLabel();
  }
});
migrateV7();
sync();
export {};
