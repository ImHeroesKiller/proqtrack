import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { posix } from "node:path";
import { createHash } from "node:crypto";

const entries = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "_headers",
  "assets",
  "src",
];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const entry of entries) {
  await cp(entry, `dist/${entry}`, { recursive: true });
}

// Leaflet is pinned in package-lock and copied into the application origin.
// Production runtime must not depend on a third-party script/style CDN.
const leafletTarget = "dist/assets/vendor/leaflet";
await mkdir(leafletTarget, { recursive: true });
await cp("node_modules/leaflet/dist/leaflet.js", `${leafletTarget}/leaflet.js`);
await cp("node_modules/leaflet/dist/leaflet.css", `${leafletTarget}/leaflet.css`);
await cp("node_modules/leaflet/dist/images", `${leafletTarget}/images`, { recursive: true });

const excludedFromPrecache = new Set([
  "_headers",
  "sw.js",
  "precache-manifest.json",
]);

async function collectFiles(dir, relative = "") {
  const children = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = relative ? posix.join(relative, child.name) : child.name;
    const full = `${dir}/${child.name}`;
    if (child.isDirectory()) files.push(...await collectFiles(full, rel));
    else if (child.isFile() && !excludedFromPrecache.has(rel)) files.push(rel);
  }
  return files;
}

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

function localDependencies(source) {
  const deps = new Set();
  const patterns = [
    /(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|import\s*\()\s*['"]([^'"]+)['"]/g,
    /\bload\(\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      if (match[1]?.startsWith(".")) deps.add(match[1]);
    }
  }
  return [...deps];
}

async function resolveModule(from, specifier) {
  let candidate = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (!posix.extname(candidate)) candidate += ".js";
  return (await fileExists(`dist/${candidate}`)) ? candidate : null;
}

async function runtimeGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const path = queue.shift();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    if (!path.endsWith(".js")) continue;
    const source = await readFile(`dist/${path}`, "utf8");
    for (const specifier of localDependencies(source)) {
      const resolved = await resolveModule(path, specifier);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

const copied = await collectFiles("dist");
const runtime = await runtimeGraph("src/entry.js");
const assetFiles = copied.filter(path => path.startsWith("assets/"));
const shell = new Set([
  "index.html",
  "manifest.webmanifest",
  ...assetFiles,
  ...runtime,
]);

const shellPaths = [...shell]
  .filter(path => !excludedFromPrecache.has(path))
  .sort();
const releaseHash = createHash("sha256");
for (const path of shellPaths) {
  releaseHash.update(path);
  releaseHash.update("\0");
  releaseHash.update(await readFile(`dist/${path}`));
  releaseHash.update("\0");
}
const release = releaseHash.digest("hex").slice(0, 16);
const assets = shellPaths.map(path => `./${path}`);

await writeFile(
  "dist/precache-manifest.json",
  `${JSON.stringify({ version: release, assets }, null, 2)}\n`,
  "utf8",
);

const swPath = "dist/sw.js";
const swSource = await readFile(swPath, "utf8");
if (!swSource.includes("__PROQTRACK_RELEASE__")) {
  throw new Error("sw.js release token missing");
}
await writeFile(swPath, swSource.replaceAll("__PROQTRACK_RELEASE__", release), "utf8");

console.log(`Static application copied to dist/; release ${release}; runtime precache contains ${assets.length} of ${copied.length} copied assets.`);
