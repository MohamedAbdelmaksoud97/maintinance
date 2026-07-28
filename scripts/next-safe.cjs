/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("child_process");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);

function safeRootForNext() {
  if (process.platform !== "win32" || !projectRoot.includes("#")) {
    return projectRoot;
  }

  const driveRoot = path.parse(projectRoot).root;
  const safeRoot = path.join(driveRoot, "maintinance-next-runtime");

  syncProjectToSafeRoot(safeRoot);
  ensureNodeModules(safeRoot);
  return safeRoot;
}

function syncProjectToSafeRoot(safeRoot) {
  fs.mkdirSync(safeRoot, { recursive: true });

  const result = spawnSync(
    "robocopy",
    [
      projectRoot,
      safeRoot,
      "/MIR",
      "/XD",
      "node_modules",
      ".next",
      ".git",
      ".vercel",
    ],
    { stdio: "inherit", windowsHide: true },
  );

  if ((result.status ?? 0) >= 8) {
    throw new Error(`robocopy failed with exit code ${result.status}`);
  }
}

function ensureNodeModules(safeRoot) {
  const target = path.join(safeRoot, "node_modules");
  const nextBin = path.join(target, "next", "dist", "bin", "next");

  if (fs.existsSync(target)) {
    const realTarget = fs.realpathSync.native(target);
    const realSafeRoot = fs.realpathSync.native(safeRoot);
    if (realTarget.toLowerCase().startsWith(realSafeRoot.toLowerCase()) && fs.existsSync(nextBin)) {
      return;
    }
    fs.rmdirSync(target);
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["install"], {
    cwd: safeRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(`npm install failed with exit code ${result.status}: ${result.error?.message ?? "unknown error"}`);
  }
}

const safeRoot = safeRootForNext();
const nextBin = path.join(safeRoot, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: safeRoot,
  env: process.env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
