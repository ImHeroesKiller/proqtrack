import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { posix } from "node:path";

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
    else if (child.isFile() && !excludedFromPrecache.has(rel)) files.push(`./${rel}`);
  }
  return files;
}

const assets = await collectFiles("dist");
await writeFile(
  "dist/precache-manifest.json",
  `${JSON.stringify({ version: 1, assets }, null, 2)}\n`,
  "utf8",
);

console.log(`Static application copied to dist/; precache manifest contains ${assets.length} assets.`);
