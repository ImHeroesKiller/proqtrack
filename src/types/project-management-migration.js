// ProQTrack — Project Management migration/runtime bootstrap domain
// Dependency-injected to keep src/types/index.js as the public orchestrator.

export function createProjectManagementMigration({ readDB, writeDB, DEFAULT_ORG_ID, allModules, now }) {
function defaultModules() {
  return Object.fromEntries(allModules.map((k) => [k, true]));
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

  return { defaultModules, migrateV7 };
}
