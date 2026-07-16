import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["--prefix", "apps/web", "run", "build:sites"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) throw result.error;

// Vinext's Windows static-export cleanup can terminate Node with this CRT
// assertion after writing a complete build. The artifact is still valid, so
// continue with the Sites packaging step for that specific exit code.
const toleratedWindowsAbort = 3221226505;
if (result.status !== 0 && result.status !== toleratedWindowsAbort) {
  process.exit(result.status ?? 1);
}

await import("./sync-sites-dist.mjs");
