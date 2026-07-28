import { cp, mkdir, rm } from "node:fs/promises";

const entries = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "assets",
  "src",
];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const entry of entries) {
  await cp(entry, `dist/${entry}`, { recursive: true });
}
console.log("Static application copied to dist/");
