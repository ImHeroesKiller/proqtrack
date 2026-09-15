/**
 * ProQTrack Project Management v7
 * Native extension for the existing vanilla ES-module/hash-router application.
 * Keeps backward compatibility with proqtrack_db_v6 while mirroring v7.
 */

import { getDB, saveDB, getCurrentOrgId, getActor, DEFAULT_ORG_ID } from "../lib/db.js";

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
  "surveys",
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
  surveys: "Surveys",
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
  if (!db.clients.length) {
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
  if (a?.role === "superadmin" || a?.role === "head") return "manager";
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
  if (role() === "project-manager") {
    const pid = account()?.projectId;
    return new Set(pid ? [pid] : []);
  }
  return new Set(
    activeAssignments(account()?.employeeId).map((a) => a.projectId),
  );
}
function projectModules() {
  const db = viewDB(),
    ids = accessibleProjectIds();
  const settings = (db.projectSettings || []).filter((s) =>
    ids.has(s.projectId),
  );
  return Object.fromEntries(
    ALL_MODULES.map((m) => [m, settings.some((s) => s.modules?.[m] !== false)]),
  );
}
function canManage() {
  return role() === "manager" || role() === "project-manager";
}
function scopedEmployees(projectId = null) {
  const db = viewDB(),
    r = role(),
    me = employee();
  if (r === "manager") return db.employees || [];
  if (r === "project-manager") {
    const pid = account()?.projectId;
    const ids = new Set((db.projectAssignments || []).filter((a) => a.projectId === pid && a.status === "active").map((a) => a.employeeId));
    return (db.employees || []).filter((e) => ids.has(e.id));
  }
  if (r === "supervisor")
    return (db.employees || [])
      .filter((e) => e.id === me?.id || e.supervisorId === me?.id)
      .filter(
        (e) =>
          !projectId ||
          (db.projectAssignments || []).some(
            (a) =>
              a.projectId === projectId &&
              a.employeeId === e.id &&
              a.status === "active",
          ),
      );
  return (db.employees || []).filter((e) => e.id === me?.id);
}
function injectStyles() {
  if (document.getElementById("projectV7Styles")) return;
  const s = document.createElement("style");
  s.id = "projectV7Styles";
  s.textContent = `.pm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-bottom:18px}.pm-kpi,.pm-panel{background:rgba(255,255,255,.96);border:1px solid #e8ebf1;border-radius:18px;box-shadow:0 8px 28px rgba(24,31,45,.07);transition:.2s}.pm-kpi{padding:18px}.pm-kpi:hover,.pm-panel:hover{transform:translateY(-2px);box-shadow:0 16px 42px rgba(24,31,45,.11)}.pm-kpi-label{font-size:12px;color:#7f8794}.pm-kpi-value{font-size:28px;font-weight:800;margin-top:4px}.pm-kpi-note{font-size:11px;color:#94a3b8;margin-top:6px}.pm-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}.pm-toolbar .input,.pm-toolbar .select{max-width:250px}.pm-client-cell{display:flex;align-items:center;gap:10px}.pm-client-logo{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#ff6b20,#d94400);color:white;display:grid;place-items:center;font-weight:800;font-size:12px}.pm-badge{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#eef2ff;color:#475569}.pm-badge.active{background:#e9fbf4;color:#07845d}.pm-badge.inactive,.pm-badge.cancelled,.pm-badge.removed{background:#fff0f0;color:#c2410c}.pm-badge.prospect,.pm-badge.draft,.pm-badge.on_hold{background:#fff7e6;color:#b45309}.pm-badge.completed{background:#eef2ff;color:#4338ca}.pm-actions{display:flex;gap:6px;flex-wrap:wrap}.pm-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.pm-detail-card{padding:17px;border:1px solid #edf0f4;border-radius:15px;background:#fbfcfe}.pm-detail-label{font-size:11px;color:#8a93a1}.pm-detail-value{font-size:13px;font-weight:600;margin-top:4px;white-space:pre-wrap}.pm-modules{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:9px}.pm-module{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border:1px solid #e8ebf1;border-radius:12px;background:#fff}.pm-module input{width:18px;height:18px;accent-color:#ef5000}.pm-modal{position:fixed;inset:0;background:rgba(15,23,42,.52);display:flex;align-items:center;justify-content:center;padding:18px;z-index:500}.pm-modal-card{width:min(720px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;box-shadow:0 30px 90px rgba(0,0,0,.28)}.pm-modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #edf0f4;position:sticky;top:0;background:#fff;z-index:2}.pm-modal-body{padding:20px}.pm-close{border:0;width:35px;height:35px;border-radius:50%;background:#f1f5f9;font-size:20px;cursor:pointer}.pm-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pm-form .full{grid-column:1/-1}.pm-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}.pm-tab{padding:8px 12px;border:1px solid #e5e7eb;border-radius:999px;background:#fff;cursor:pointer;font-size:12px;font-weight:700}.pm-tab.active{background:#fff1e8;color:#c94300;border-color:#fed7aa}.pm-supervisor-row{display:grid;grid-template-columns:1.5fr repeat(4,1fr);gap:8px;align-items:center;padding:12px;border-bottom:1px solid #edf0f4}.pm-supervisor-row.head{font-size:11px;font-weight:700;color:#94a3b8}.pm-project-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;background:#fff1e8;color:#c94300;font-size:11px;font-weight:700;margin:3px}.pm-project-selector{margin-bottom:12px;padding:12px;background:#fff8f3;border:1px solid #fed7aa;border-radius:12px}.pm-hidden{display:none!important}@media(max-width:700px){.pm-form,.pm-detail-grid{grid-template-columns:1fr}.pm-form .full{grid-column:auto}.pm-toolbar .input,.pm-toolbar .select{max-width:none;width:100%}.pm-supervisor-row{grid-template-columns:1.4fr repeat(2,1fr)}.pm-supervisor-row>*:nth-child(n+4){display:none}}`;
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
function renderClients() {
  const db = viewDB(),
    rows = db.clients || [];
  return shell(
    "Klien",
    "Master perusahaan, PIC dan periode kerja sama",
    `${kpis([
      ["Total Klien", rows.length],
      ["Aktif", rows.filter((x) => x.status === "active").length],
      ["Prospect", rows.filter((x) => x.status === "prospect").length],
      ["Project Terhubung", (db.projects || []).length],
    ])}<div class="card"><div class="pm-toolbar"><button class="btn btn-primary" onclick="PM.openClient()">${svg("plus")} Tambah Klien</button><input class="input" placeholder="Cari klien, PIC, kota" oninput="PM.filterRows('clientRows',this.value)"><select class="select" onchange="PM.filterStatus('clientRows',this.value)"><option value="">Semua status</option><option>active</option><option>prospect</option><option>inactive</option></select></div><div class="visits-table-wrapper"><table class="table"><thead><tr><th>Klien</th><th>Industri</th><th>PIC Utama</th><th>Lokasi</th><th>Project</th><th>Status</th><th>Aksi</th></tr></thead><tbody id="clientRows">${rows
      .map(
        (c) =>
          `<tr data-status="${esc(c.status)}" data-search="${esc(`${c.name} ${c.picName} ${c.city}`.toLowerCase())}"><td><div class="pm-client-cell"><span class="pm-client-logo">${esc(
            c.name
              .split(" ")
              .map((x) => x[0])
              .slice(0, 2)
              .join(""),
          )}</span><div><strong>${esc(c.name)}</strong><div style="font-size:11px;color:#94a3b8">${esc(c.legalName || "")}</div></div></div></td><td>${esc(c.industry)}</td><td><strong>${esc(c.picName || "-")}</strong><div style="font-size:11px;color:#94a3b8">${esc(c.picRole || "")}</div></td><td>${esc([c.city, c.province].filter(Boolean).join(", "))}</td><td>${(db.projects || []).filter((p) => p.clientId === c.id).length}</td><td>${statusBadge(c.status)}</td><td><div class="pm-actions"><button class="btn btn-secondary btn-sm" onclick="PM.viewClient('${c.id}')">${svg("eye")} Detail</button><button class="btn btn-secondary btn-sm" onclick="PM.openClient('${c.id}')">${svg("edit")} Edit</button></div></td></tr>`,
      )
      .join("")}</tbody></table></div></div>`,
  );
}
function renderProjects(readOnly = false) {
  const db = viewDB(),
    cm = clientById(db),
    ids = accessibleProjectIds();
  let rows = (db.projects || []).filter(
    (p) => role() === "manager" || ids.has(p.id),
  );
  return shell(
    readOnly ? "Project Saya" : "Project",
    readOnly
      ? "Informasi ringkas project yang ditugaskan kepada Anda"
      : "SoW, periode, target, assignment dan pengaturan modul",
    `${kpis([
      ["Total Project", rows.length],
      ["Aktif", rows.filter((x) => x.status === "active").length],
      [
        "Draft / Hold",
        rows.filter((x) => ["draft", "on_hold"].includes(x.status)).length,
      ],
      [
        "Assignment Aktif",
        (db.projectAssignments || []).filter(
          (x) =>
            x.status === "active" && rows.some((p) => p.id === x.projectId),
        ).length,
      ],
    ])}<div class="card"><div class="pm-toolbar">${!readOnly && canManage() ? `<button class="btn btn-primary" onclick="PM.openProject()">${svg("plus")} Tambah Project</button>` : ""}<input class="input" placeholder="Cari project, kode, klien" oninput="PM.filterRows('projectRows',this.value)"><select class="select" onchange="PM.filterStatus('projectRows',this.value)"><option value="">Semua status</option><option>active</option><option>draft</option><option>on_hold</option><option>completed</option><option>cancelled</option></select><select class="select" onchange="PM.filterClient('projectRows',this.value)"><option value="">Semua klien</option>${(db.clients || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div><div class="visits-table-wrapper"><table class="table"><thead><tr><th>Project</th><th>Klien</th><th>Periode</th>${readOnly ? "<th>Supervisor</th><th>Manager</th>" : "<th>Target</th><th>Assignee</th><th>Status</th><th>Aksi</th>"}</tr></thead><tbody id="projectRows">${rows
      .map((p) => {
        const c = cm[p.clientId] || {},
          ass = (db.projectAssignments || []).filter(
            (a) => a.projectId === p.id && a.status === "active",
          );
        const em = Object.fromEntries((db.employees || []).map((x) => [x.id, x]));
        const sup = ass.find((a) => a.roleOnProject === "supervisor") || {};
        const managerName = (db.accounts || []).find((a) => a.role === "manager" && a.status === "active")?.name || "—";
        const search = esc(`${p.name} ${p.code} ${c.name || ""}`.toLowerCase());
        if (readOnly) {
          return `<tr data-status="${esc(p.status)}" data-client="${esc(p.clientId)}" data-search="${search}"><td><strong>${esc(p.name)}</strong><div style="font-size:11px;color:#94a3b8">${esc(p.code || "")}</div></td><td>${esc(c.name || "-")}</td><td>${dateLabel(p.startDate)} – ${dateLabel(p.endDate)}</td><td>${esc(em[sup.employeeId || p.supervisorId]?.name || "—")}</td><td>${esc(managerName)}</td></tr>`;
        }
        return `<tr data-status="${esc(p.status)}" data-client="${esc(p.clientId)}" data-search="${search}"><td><strong>${esc(p.name)}</strong><div style="font-size:11px;color:#94a3b8">${esc(p.code)}</div></td><td>${esc(c.name || "-")}</td><td>${dateLabel(p.startDate)} – ${dateLabel(p.endDate)}</td><td>${p.targetVisits || "-"} visit<br><span style="font-size:11px;color:#94a3b8">${p.targetOutlets || "-"} outlet</span></td><td>${ass.length}</td><td>${statusBadge(p.status)}</td><td><div class="pm-actions"><button class="btn btn-secondary btn-sm" onclick="PM.viewProject('${p.id}')">${svg("eye")} Detail</button>${canManage() ? `<button class="btn btn-secondary btn-sm" onclick="PM.openProject('${p.id}')">${svg("edit")} Edit</button>` : ""}</div></td></tr>`;
      })
      .join("")}</tbody></table></div></div>`,
  );
}
function renderAssignments() {
  const db = viewDB(),
    pm = projectById(db),
    cm = clientById(db),
    em = Object.fromEntries((db.employees || []).map((x) => [x.id, x]));
  const rows = db.projectAssignments || [];
  return shell(
    "Assignment Project",
    "Penugasan supervisor, sales dan viewer per project",
    `${kpis([
      ["Assignment", rows.length],
      ["Aktif", rows.filter((x) => x.status === "active").length],
      [
        "Supervisor",
        rows.filter(
          (x) => x.status === "active" && x.roleOnProject === "supervisor",
        ).length,
      ],
      [
        "Sales",
        rows.filter((x) => x.status === "active" && x.roleOnProject === "sales")
          .length,
      ],
    ])}<div class="card"><div class="pm-toolbar"><select class="select" onchange="PM.filterProject('assignmentRows',this.value)"><option value="">Semua project</option>${(db.projects || []).map((p) => `<option value="${p.id}">${esc(p.code)} — ${esc(p.name)}</option>`).join("")}</select><input class="input" placeholder="Cari project atau karyawan" oninput="PM.filterRows('assignmentRows',this.value)"></div><div class="visits-table-wrapper"><table class="table"><thead><tr><th>Project</th><th>Klien</th><th>Karyawan</th><th>Role</th><th>Supervisor</th><th>Status</th><th>Aksi</th></tr></thead><tbody id="assignmentRows">${rows
      .map((a) => {
        const p = pm[a.projectId] || {},
          e = em[a.employeeId] || {},
          sp = em[e.supervisorId] || {};
        return `<tr data-project="${esc(a.projectId)}" data-search="${esc(`${p.name} ${e.name}`.toLowerCase())}"><td><strong>${esc(p.name || a.projectId)}</strong><div style="font-size:11px;color:#94a3b8">${esc(p.code || "")}</div></td><td>${esc(cm[p.clientId]?.name || "-")}</td><td>${esc(e.name || a.employeeId)}</td><td>${statusBadge(a.roleOnProject)}</td><td>${esc(sp.name || "-")}</td><td>${statusBadge(a.status)}</td><td><button class="btn btn-secondary btn-sm" onclick="PM.toggleAssignment('${a.id}')">${svg("unlink")} ${a.status === "active" ? "Unassign" : "Aktifkan"}</button></td></tr>`;
      })
      .join("")}</tbody></table></div></div>`,
  );
}
function renderMyTeam() {
  const db = viewDB(),
    me = employee(),
    ids = accessibleProjectIds(),
    team = scopedEmployees();
  const pm = projectById(db);
  const visits = (db.visits || []).filter(
    (v) =>
      team.some((e) => e.id === v.employeeId) &&
      (!v.projectId || ids.has(v.projectId)),
  );
  return shell(
    "Tim Saya",
    "Sales di bawah supervisi dan project yang sama",
    `${kpis([
      ["Anggota Tim", Math.max(0, team.length - 1)],
      ["Project Aktif", ids.size],
      ["Kunjungan", visits.length],
      ["Selesai", visits.filter((v) => v.status === "completed").length],
    ])}<div class="card"><div class="visits-table-wrapper"><table class="table"><thead><tr><th>Karyawan</th><th>Area</th><th>Project</th><th>Kunjungan</th><th>Status</th></tr></thead><tbody>${team
      .filter((e) => e.id !== me?.id)
      .map((e) => {
        const as = (db.projectAssignments || []).filter(
          (a) =>
            a.employeeId === e.id &&
            a.status === "active" &&
            ids.has(a.projectId),
        );
        const ev = visits.filter((v) => v.employeeId === e.id);
        return `<tr><td><strong>${esc(e.name)}</strong><div style="font-size:11px;color:#94a3b8">${esc(e.role)}</div></td><td>${esc(e.area || "-")}</td><td>${as.map((a) => `<span class="pm-project-chip">${esc(pm[a.projectId]?.code || a.projectId)}</span>`).join("") || "-"}</td><td>${ev.filter((v) => v.status === "completed").length}/${ev.length}</td><td>${statusBadge(e.status || "active")}</td></tr>`;
      })
      .join("")}</tbody></table></div></div>`,
  );
}
function renderSupervisorCompare() {
  const db = viewDB(),
    ids = accessibleProjectIds();
  const supervisors = (db.employees || [])
    .filter((e) =>
      String(e.role || "")
        .toLowerCase()
        .includes("supervisor"),
    )
    .filter((e) =>
      (db.projectAssignments || []).some(
        (a) =>
          a.employeeId === e.id &&
          a.status === "active" &&
          ids.has(a.projectId),
      ),
    );
  const metric = (s) => {
    const team = (db.employees || [])
      .filter((e) => e.supervisorId === s.id)
      .map((e) => e.id);
    const relevant = (arr, owner = "employeeId") =>
      (arr || []).filter(
        (x) =>
          team.includes(x[owner] || x.recordedBy) &&
          (!x.projectId || ids.has(x.projectId)),
      ).length;
    return {
      visits: relevant(db.visits),
      intel: relevant(db.competitorIntel, "recordedBy"),
      photos: relevant(db.fieldPhotos, "recordedBy"),
      prices: relevant(db.priceObservations, "employeeId"),
    };
  };
  return shell(
    "Komparasi Supervisor",
    "Ringkasan agregat supervisor pada project yang sama tanpa detail sales lain",
    `${kpis([
      ["Supervisor Terbanding", supervisors.length],
      ["Project Bersama", ids.size],
      ["Privasi Detail", "Terjaga", "Hanya metrik agregat"],
      ["Scope", "Project sama"],
    ])}<div class="card"><div class="pm-supervisor-row head"><span>Supervisor</span><span>Visit</span><span>Intel</span><span>Foto</span><span>Harga</span></div>${
      supervisors
        .map((s) => {
          const m = metric(s);
          return `<div class="pm-supervisor-row"><strong>${esc(s.name)}</strong><span>${m.visits}</span><span>${m.intel}</span><span>${m.photos}</span><span>${m.prices}</span></div>`;
        })
        .join("") ||
      '<div style="padding:34px;text-align:center;color:#94a3b8">Belum ada supervisor lain pada project yang sama.</div>'
    }</div>`,
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
  el.innerHTML = `<div class="pm-modal-card"><div class="pm-modal-head"><h3>${esc(title)}</h3><button class="pm-close" onclick="PM.close()">×</button></div><div class="pm-modal-body">${body}</div></div>`;
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
    if (!canManage()) return;
    const db = viewDB(),
      c = (db.clients || []).find((x) => x.id === id) || {},
      pics = c.additionalPics || [];
    modal(
      id ? "Edit Klien" : "Tambah Klien",
      `<form class="pm-form" onsubmit="PM.saveClient(event,'${id}')"><div class="full"><label class="label">Nama Perusahaan</label><input class="input" name="name" value="${esc(c.name || "")}" required></div><div><label class="label">Nama Legal</label><input class="input" name="legalName" value="${esc(c.legalName || "")}"></div><div><label class="label">Industri</label><select class="select" name="industry">${["FMCG", "Farmasi", "Bangunan", "Retail", "F&B", "Telco", "Lainnya"].map((x) => `<option ${c.industry === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div><label class="label">NPWP / SIUP</label><input class="input" name="npwp" value="${esc(c.npwp || "")}"></div><div><label class="label">Status</label><select class="select" name="status">${["active", "inactive", "prospect"].map((x) => `<option ${c.status === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="full"><label class="label">Alamat</label><textarea class="textarea" name="address">${esc(c.address || "")}</textarea></div><div><label class="label">Kota</label><input class="input" name="city" value="${esc(c.city || "")}"></div><div><label class="label">Provinsi</label><input class="input" name="province" value="${esc(c.province || "")}"></div><div class="full"><label class="label">Website</label><input class="input" name="website" value="${esc(c.website || "")}"></div><div class="full"><label class="label">Logo klien</label><input class="input" type="file" name="logoFile" accept="image/jpeg,image/png,image/webp"><input type="hidden" name="logoUrl" value="${esc(c.logoUrl || c.logo || "")}">${c.logoUrl || c.logo ? `<img alt="Logo" src="${esc(c.logoUrl || c.logo)}" style="max-height:48px;margin-top:8px">` : ""}</div><div><label class="label">PIC Utama</label><input class="input" name="picName" value="${esc(c.picName || "")}" required></div><div><label class="label">Jabatan PIC</label><input class="input" name="picRole" value="${esc(c.picRole || "")}"></div><div><label class="label">Telepon PIC</label><input class="input" name="picPhone" value="${esc(c.picPhone || "")}"></div><div><label class="label">Email PIC</label><input class="input" type="email" name="picEmail" value="${esc(c.picEmail || "")}"></div><div><label class="label">Mulai Kerja Sama</label><input class="input" type="date" name="cooperationStart" value="${esc(c.cooperationStart || "")}"></div><div><label class="label">Akhir Kerja Sama</label><input class="input" type="date" name="cooperationEnd" value="${esc(c.cooperationEnd || "")}"></div><div class="full"><label class="label">PIC Tambahan (Nama | Jabatan | Telepon | Email)</label><textarea class="textarea" name="additionalPics">${esc(pics.map((p) => [p.name, p.role, p.phone, p.email].join(" | ")).join("\n"))}</textarea></div><div class="full"><label class="label">Catatan</label><textarea class="textarea" name="notes">${esc(c.notes || "")}</textarea></div><div class="full"><button class="btn btn-primary btn-block">Simpan Klien</button></div></form>`,
    );
  },
  saveClient(e, id) {
    e.preventDefault();
    if (!canManage()) return;
    const db = viewDB(),
      fd = new FormData(e.target),
      rows = db.clients || [],
      old = rows.find((x) => x.id === id),
      pics = formValue(fd, "additionalPics")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => {
          const [name = "", role = "", phone = "", email = ""] = x
            .split("|")
            .map((y) => y.trim());
          return { name, role, phone, email };
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
    const data = {
      id: id || uid("CL"),
      name,
      legalName,
      industry: formValue(fd, "industry"),
      npwp: formValue(fd, "npwp"),
      address: formValue(fd, "address"),
      city: formValue(fd, "city"),
      province: formValue(fd, "province"),
      website: formValue(fd, "website"),
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
    const finish = () => {
      const i = rows.findIndex((x) => x.id === id);
      i >= 0 ? (rows[i] = data) : rows.push(data);
      db.clients = rows;
      persistView(db);
      this.close();
      renderClients();
    };
    const file = e.target.querySelector('[name="logoFile"]')?.files?.[0];
    if (file && window.R2?.uploadAsset) {
      window.R2.uploadAsset(file, { category: 'client-logo', projectId: 'general', name: file.name })
        .then(uploaded => {
          data.logoUrl = uploaded.url;
          data.logo = uploaded.url;
          data.r2Key = uploaded.key;
          data.logoStorage = 'r2';
          finish();
        })
        .catch(error => {
          window.showToast?.(`Logo R2 gagal: ${error.message || error}`, 'error');
          finish();
        });
      return;
    }
    finish();
  },
  viewClient(id) {
    if (!canManage()) return;
    const db = viewDB(),
      c = db.clients.find((x) => x.id === id),
      projects = db.projects.filter((p) => p.clientId === id);
    if (!c) return;
    modal(
      c.name,
      `<div class="pm-detail-grid"><div class="pm-detail-card"><div class="pm-detail-label">Nama Legal</div><div class="pm-detail-value">${esc(c.legalName || "-")}</div></div><div class="pm-detail-card"><div class="pm-detail-label">Industri / Status</div><div class="pm-detail-value">${esc(c.industry)} · ${statusBadge(c.status)}</div></div><div class="pm-detail-card"><div class="pm-detail-label">Lokasi</div><div class="pm-detail-value">${esc(c.address || "-")}\n${esc([c.city, c.province].filter(Boolean).join(", "))}</div></div><div class="pm-detail-card"><div class="pm-detail-label">Periode Kerja Sama</div><div class="pm-detail-value">${dateLabel(c.cooperationStart)} – ${dateLabel(c.cooperationEnd)}</div></div><div class="pm-detail-card"><div class="pm-detail-label">PIC Utama</div><div class="pm-detail-value">${esc(c.picName || "-")}\n${esc(c.picRole || "")}\n${esc(c.picPhone || "")} · ${esc(c.picEmail || "")}</div></div><div class="pm-detail-card"><div class="pm-detail-label">PIC Tambahan</div><div class="pm-detail-value">${(c.additionalPics || []).map((p) => `${esc(p.name)} — ${esc(p.role)}`).join("<br>") || "-"}</div></div><div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Project</div><div class="pm-detail-value">${projects.map((p) => `<span class="pm-project-chip">${esc(p.code)} — ${esc(p.name)}</span>`).join("") || "-"}</div></div></div>`,
    );
  },
  openProject(id = "") {
    if (!canManage()) return;
    const db = viewDB(),
      p = (db.projects || []).find((x) => x.id === id) || {};
    if (!db.clients?.length) {
      alert("Tambahkan klien terlebih dahulu sebelum membuat project.");
      return;
    }
    modal(
      id ? "Edit Project" : "Tambah Project",
      `<form class="pm-form" onsubmit="PM.saveProject(event,'${id}')"><div class="full"><label class="label">Nama Project</label><input class="input" name="name" value="${esc(p.name || "")}" required></div><div><label class="label">Klien</label><select class="select" name="clientId" required>${db.clients.map((c) => `<option value="${c.id}" ${p.clientId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div><div><label class="label">Kode Internal</label><input class="input" name="code" value="${esc(p.code || "")}" required></div><div class="full"><label class="label">Description / SoW</label><textarea class="textarea" style="min-height:130px" name="description" required>${esc(p.description || "")}</textarea></div><div><label class="label">Mulai</label><input class="input" type="date" name="startDate" value="${esc(p.startDate || "")}" required></div><div><label class="label">Selesai</label><input class="input" type="date" name="endDate" value="${esc(p.endDate || "")}" required></div><div><label class="label">Status</label><select class="select" name="status">${["draft", "active", "on_hold", "completed", "cancelled"].map((x) => `<option ${p.status === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div><label class="label">Nilai Kontrak</label><input class="input" type="number" min="0" name="contractValue" value="${p.contractValue || ""}"></div><div><label class="label">Target Visit</label><input class="input" type="number" min="0" name="targetVisits" value="${p.targetVisits || ""}"></div><div><label class="label">Target Outlet</label><input class="input" type="number" min="0" name="targetOutlets" value="${p.targetOutlets || ""}"></div><div class="full"><label class="label">Coverage Area</label><input class="input" name="region" value="${esc(p.region || "")}"></div><div class="full"><label class="label">Catatan</label><textarea class="textarea" name="notes">${esc(p.notes || "")}</textarea></div><div class="full"><button class="btn btn-primary btn-block">Simpan Project</button></div></form>`,
    );
  },
  saveProject(e, id) {
    e.preventDefault();
    if (!canManage()) return;
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
      region: formValue(fd, "region"),
      notes: formValue(fd, "notes"),
      createdAt: old?.createdAt || now(),
      updatedAt: now(),
    };
    const i = rows.findIndex((x) => x.id === id);
    i >= 0 ? (rows[i] = data) : rows.push(data);
    db.projects = rows;
    if (!db.projectSettings.some((s) => s.projectId === data.id))
      db.projectSettings.push({
        projectId: data.id,
        organizationId: data.organizationId,
        modules: defaultModules(),
        updatedAt: now(),
        updatedBy: account()?.id,
      });
    persistView(db);
    this.close();
    renderProjects(false);
  },
  viewProject(id) {
    const db = viewDB(),
      p = db.projects.find((x) => x.id === id),
      c = db.clients.find((x) => x.id === p?.clientId),
      ass = (db.projectAssignments || []).filter((a) => a.projectId === id),
      set = db.projectSettings.find((s) => s.projectId === id) || {
        modules: defaultModules(),
      },
      em = Object.fromEntries(db.employees.map((e) => [e.id, e]));
    if (!p || (!canManage() && !accessibleProjectIds().has(id))) return;
    modal(
      `${p.code} — ${p.name}`,
      `<div class="pm-tabs"><button class="pm-tab active">Ringkasan</button>${canManage() ? `<button class="pm-tab" onclick="PM.openAssign('${id}')">Kelola Assignment</button>` : ""}</div><div class="pm-detail-grid"><div class="pm-detail-card"><div class="pm-detail-label">Klien</div><div class="pm-detail-value">${esc(c?.name || "-")}</div></div><div class="pm-detail-card"><div class="pm-detail-label">Status / Periode</div><div class="pm-detail-value">${statusBadge(p.status)}<br>${dateLabel(p.startDate)} – ${dateLabel(p.endDate)}</div></div>${canManage() ? `<div class="pm-detail-card"><div class="pm-detail-label">Nilai Kontrak</div><div class="pm-detail-value">${money(p.contractValue)}</div></div>` : ""}<div class="pm-detail-card"><div class="pm-detail-label">Target</div><div class="pm-detail-value">${p.targetVisits || "-"} visit · ${p.targetOutlets || "-"} outlet</div></div><div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Statement of Work</div><div class="pm-detail-value">${esc(p.description || "-")}</div></div><div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Assignment</div><div class="pm-detail-value">${
        ass
          .filter((a) => a.status === "active")
          .map(
            (a) =>
              `${esc(em[a.employeeId]?.name || a.employeeId)} ${statusBadge(a.roleOnProject)}`,
          )
          .join("<br>") || "-"
      }</div></div><div class="pm-detail-card" style="grid-column:1/-1"><div class="pm-detail-label">Modul Field Aktif</div><div class="pm-modules" style="margin-top:10px">${ALL_MODULES.map((m) => `<label class="pm-module"><span>${esc(MODULE_LABELS[m])}</span><input type="checkbox" ${set.modules?.[m] !== false ? "checked" : ""} ${canManage() ? "" : "disabled"} onchange="PM.setModule('${id}','${m}',this.checked)"></label>`).join("")}</div></div></div>`,
    );
  },
  setModule(projectId, module, value) {
    if (!canManage()) return;
    const db = viewDB();
    let s = db.projectSettings.find((x) => x.projectId === projectId);
    if (!s) {
      s = { projectId, organizationId: currentOrgId(), modules: defaultModules() };
      db.projectSettings.push(s);
    }
    if (!s.organizationId) s.organizationId = currentOrgId();
    s.modules = { ...defaultModules(), ...s.modules, [module]: value };
    s.updatedAt = now();
    s.updatedBy = account()?.id;
    persistView(db);
    applyModuleVisibility();
  },
  openAssign(projectId) {
    if (!canManage()) return;
    const db = viewDB(),
      p = db.projects.find((x) => x.id === projectId),
      active = db.projectAssignments.filter(
        (a) => a.projectId === projectId && a.status === "active",
      );
    if (!p) return;
    const eligible = db.employees.filter(
      (employee) =>
        employee.status === "active" &&
        db.accounts.some(
          (user) =>
            user.employeeId === employee.id && user.status !== "inactive",
        ),
    );
    const supervisors = active
      .filter((a) => a.roleOnProject === "supervisor")
      .map((a) => db.employees.find((employee) => employee.id === a.employeeId))
      .filter(Boolean);
    modal(
      `Assignment — ${p?.name || projectId}`,
      `<form class="pm-form" onsubmit="PM.saveAssignment(event,'${projectId}')"><div class="full"><label class="label">Karyawan aktif dengan akun login</label><select class="select" name="employeeId" required>${eligible.map((employee) => `<option value="${employee.id}">${esc(employee.name)} — ${esc(employee.role)}</option>`).join("")}</select></div><div><label class="label">Role pada Project</label><select class="select" name="roleOnProject"><option>supervisor</option><option>sales</option><option>viewer</option></select></div><div><label class="label">Supervisor Project</label><select class="select" name="supervisorId"><option value="">Pilih untuk sales/viewer</option>${supervisors.map((employee) => `<option value="${employee.id}">${esc(employee.name)}</option>`).join("")}</select></div><div><label class="label">Mulai Assignment</label><input class="input" type="date" name="startDate" min="${p.startDate}" max="${p.endDate}" value="${p.startDate}" required></div><div><label class="label">Selesai Assignment</label><input class="input" type="date" name="endDate" min="${p.startDate}" max="${p.endDate}" value="${p.endDate}" required></div><div><label class="label">Alokasi Kapasitas (%)</label><input class="input" type="number" name="allocationPercent" min="1" max="100" value="100" required></div><div><label class="label">Alasan / cakupan kerja</label><input class="input" name="notes" required placeholder="Contoh: coverage Jakarta Selatan"></div><div class="full"><button class="btn btn-primary btn-block">Validasi & Assign</button></div></form><div style="margin-top:18px"><div class="card-title">Assignment aktif</div>${
        active
          .map((a) => {
            const e = db.employees.find((x) => x.id === a.employeeId);
            return `<div class="pm-module"><span><strong>${esc(e?.name || a.employeeId)}</strong><br><small>${esc(a.roleOnProject)} · ${a.allocationPercent || 0}% · ${dateLabel(a.startDate)}–${dateLabel(a.endDate)}</small></span><button class="btn btn-secondary btn-sm" onclick="PM.toggleAssignment('${a.id}');PM.openAssign('${projectId}')">Unassign</button></div>`;
          })
          .join("") ||
        '<div style="padding:34px;text-align:center;color:#94a3b8">Belum ada assignment.</div>'
      }</div>`,
    );
  },
  saveAssignment(e, projectId) {
    e.preventDefault();
    if (!canManage()) return;
    const db = viewDB(),
      fd = new FormData(e.target),
      employeeId = formValue(fd, "employeeId"),
      roleOnProject = formValue(fd, "roleOnProject"),
      existing = db.projectAssignments.find(
        (a) => a.projectId === projectId && a.employeeId === employeeId,
      );
    const project = db.projects.find((x) => x.id === projectId);
    const emp = db.employees.find((x) => x.id === employeeId);
    if (!project || !emp) {
      alert("Project atau karyawan tidak valid.");
      return;
    }
    if (!["supervisor", "sales", "viewer"].includes(roleOnProject)) {
      alert("Role project tidak valid.");
      return;
    }
    if (emp.status === "inactive") {
      alert("Karyawan nonaktif tidak dapat di-assign.");
      return;
    }
    const user = db.accounts.find((a) => a.employeeId === employeeId);
    if (!user || user.status === "inactive") {
      alert("Karyawan harus memiliki akun login aktif sebelum di-assign.");
      return;
    }
    if (!["active", "draft"].includes(project.status)) {
      alert("Assignment hanya dapat dibuat untuk project draft atau aktif.");
      return;
    }
    const startDate = formValue(fd, "startDate");
    const endDate = formValue(fd, "endDate");
    const allocationPercent = Number(fd.get("allocationPercent"));
    if (
      startDate < project.startDate ||
      endDate > project.endDate ||
      endDate < startDate
    ) {
      alert("Periode assignment harus berada di dalam periode project.");
      return;
    }
    if (
      !Number.isFinite(allocationPercent) ||
      allocationPercent < 1 ||
      allocationPercent > 100
    ) {
      alert("Alokasi kapasitas harus 1–100%.");
      return;
    }
    const allocated = db.projectAssignments
      .filter(
        (a) =>
          a.employeeId === employeeId &&
          a.status === "active" &&
          a.id !== existing?.id &&
          a.startDate <= endDate &&
          a.endDate >= startDate,
      )
      .reduce((sum, a) => sum + Number(a.allocationPercent || 100), 0);
    if (allocated + allocationPercent > 100) {
      alert(`Kapasitas bentrok. Periode tersebut sudah teralokasi ${allocated}%.`);
      return;
    }
    const sp = formValue(fd, "supervisorId");
    if (sp === employeeId) {
      alert("Karyawan tidak dapat menjadi supervisor untuk dirinya sendiri.");
      return;
    }
    if (
      roleOnProject !== "supervisor" &&
      !db.projectAssignments.some(
        (a) =>
          a.projectId === projectId &&
          a.employeeId === sp &&
          a.roleOnProject === "supervisor" &&
          a.status === "active" &&
          a.startDate <= endDate &&
          a.endDate >= startDate,
      )
    ) {
      alert(
        "Sales/viewer wajib memiliki supervisor aktif pada project dan periode yang sama.",
      );
      return;
    }
    const assignmentData = {
      roleOnProject,
      supervisorId: roleOnProject === "supervisor" ? null : sp,
      startDate,
      endDate,
      allocationPercent,
      notes: formValue(fd, "notes"),
      status: "active",
      assignedAt: now(),
      assignedBy: account()?.id,
      updatedAt: now(),
    };
    if (existing) {
      Object.assign(existing, assignmentData);
    } else
      db.projectAssignments.push({
        id: uid("ASN"),
        projectId,
        employeeId,
        organizationId: currentOrgId(),
        ...assignmentData,
      });
    persistView(db);
    this.openAssign(projectId);
  },
  toggleAssignment(id) {
    if (!canManage()) return;
    const db = viewDB(),
      a = db.projectAssignments.find((x) => x.id === id);
    if (!a) return;
    a.status = a.status === "active" ? "removed" : "active";
    a.updatedAt = now();
    if (a.status === "removed") {
      a.removedAt = now();
      a.removedBy = account()?.id;
    }
    persistView(db);
    if (location.hash === "#/assignments") renderAssignments();
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
let queued = false;
function sync() {
  queued = false;
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
new MutationObserver(() => {
  if (!queued) {
    queued = true;
    requestAnimationFrame(sync);
  }
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("hashchange", () => setTimeout(sync));
window.addEventListener("storage", sync);
migrateV7();
sync();
export {};
