// ProQTrack — Project Management migration/runtime bootstrap domain
// Dependency-injected to keep src/types/index.js as the public orchestrator.

export function createProjectManagementMigration({ readDB, writeDB, DEFAULT_ORG_ID, allModules, now }) {
function defaultModules() {
  return Object.fromEntries(allModules.map((k) => [k, true]));
}
function migrateV7() {
  const db = readDB();
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
  // Demo/client/project fixtures are provisioned by canonical seed/D1 flows.
  // Legacy runtime seeding was removed from the production frontend in P3-C.
  const assignmentCounts = db.projectAssignments
    .filter((a) => a.status === "active")
    .reduce((counts, a) => {
      counts[a.employeeId] = (counts[a.employeeId] || 0) + 1;
      return counts;
    }, {});
  const nextAssignments = db.projectAssignments.map((assignment) => {
    const project = db.projects.find((p) => p.id === assignment.projectId);
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
    // Cloud operational assignment lifecycle is server-authoritative.
    // Never close an active assignment merely because the browser cache does
    // not contain the employee's account record. Account lists are loaded
    // separately and may be intentionally partial.
    if (normalized.status === "removed") normalized.status = "ended";
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
