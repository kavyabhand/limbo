// Runs every end-to-end suite in turn and fails if any of them failed.  npm run e2e
import { spawnSync } from "node:child_process";

const suites = ["api.mjs", "live-room.mjs", "offline.mjs", "demo-journey.mjs"];
let failed = 0;
for (const s of suites) {
  const r = spawnSync(process.execPath, [new URL(s, import.meta.url).pathname], { stdio: "inherit", env: process.env });
  if (r.status !== 0) failed++;
}
console.log(`\n${suites.length - failed}/${suites.length} suites passed`);
process.exitCode = failed ? 1 : 0;
