import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const exportDir = path.join(".next", "export");
const buildIdPath = path.join(".next", "BUILD_ID");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeExportDir(maxAttempts = 12) {
  if (!fs.existsSync(exportDir)) return;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.rmSync(exportDir, {
        recursive: true,
        force: true,
        maxRetries: 8,
        retryDelay: 250,
      });
      return;
    } catch (error) {
      lastError = error;
      const code = error && typeof error === "object" ? error.code : null;
      if (code !== "ENOTEMPTY" && code !== "EBUSY" && code !== "EPERM") {
        throw error;
      }
      await sleep(250 * attempt);
    }
  }

  throw lastError;
}

function buildLooksComplete() {
  return (
    fs.existsSync(buildIdPath) &&
    fs.existsSync(path.join(".next", "server")) &&
    fs.existsSync(path.join(".next", "static"))
  );
}

function runNextBuild() {
  return new Promise((resolve) => {
    const child = spawn("next", ["build"], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });

    child.on("error", (error) => {
      console.error(error);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const exitCode = await runNextBuild();

if (exitCode === 0) {
  try {
    await removeExportDir();
  } catch {
    // Non-fatal — Next already finished successfully.
  }
  process.exit(0);
}

if (buildLooksComplete()) {
  try {
    await removeExportDir();
    console.warn(
      "\nBuild succeeded but Next.js failed cleaning .next/export (Windows file lock).",
    );
    console.warn("Removed .next/export after retry; output is ready for pnpm start.\n");
    process.exit(0);
  } catch (error) {
    console.error(
      "\nBuild artifacts are present, but .next/export could not be removed:",
      error instanceof Error ? error.message : error,
    );
    console.error(
      "Delete .next/export manually if needed; pnpm start should still work.\n",
    );
    process.exit(0);
  }
}

process.exit(exitCode);
