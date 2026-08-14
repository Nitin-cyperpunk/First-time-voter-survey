import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const exportDir = path.join(".next", "export");
const cacheDir = path.join(".next", "cache");
const buildIdPath = path.join(".next", "BUILD_ID");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeDir(target, maxAttempts = 12) {
  if (!fs.existsSync(target)) return;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.rmSync(target, {
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
    const child = spawn(process.execPath, [nextBin, "build"], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", (error) => {
      console.error(error);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function cleanFlakyArtifacts() {
  await removeDir(exportDir).catch(() => {});
  await removeDir(cacheDir).catch(() => {});
}

async function finishSuccessfulBuild() {
  try {
    await removeDir(exportDir);
  } catch {
    // Non-fatal — Next already finished successfully.
  }
  process.exit(0);
}

async function recoverFromLateExportCleanupFailure() {
  try {
    await removeDir(exportDir);
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

let exitCode = await runNextBuild();

if (exitCode !== 0 && !buildLooksComplete()) {
  console.warn(
    "\nBuild failed (often a Windows race on pages-manifest/_document).",
  );
  console.warn("Clearing .next/cache and .next/export, then retrying once...\n");
  await cleanFlakyArtifacts();
  exitCode = await runNextBuild();
}

if (exitCode === 0) {
  await finishSuccessfulBuild();
}

if (buildLooksComplete()) {
  await recoverFromLateExportCleanupFailure();
}

process.exit(exitCode);
