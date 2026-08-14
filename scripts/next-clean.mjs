import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const DEV_PORTS = [3000, 3001];
const guard = process.argv.includes("--guard");

/** Connect probe — reliable when Next dev is already listening on the port. */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const finish = (inUse) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(750);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function assertDevServerStopped() {
  const blocked = [];
  for (const port of DEV_PORTS) {
    if (await portInUse(port)) blocked.push(port);
  }
  if (blocked.length === 0) return;

  console.error(
    `\nBuild blocked: port(s) ${blocked.join(", ")} in use (pnpm dev is likely running).`,
  );
  console.error(
    "Stop the dev server (Ctrl+C in that terminal), then run pnpm build again.\n",
  );
  process.exit(1);
}

function cleanNextDir() {
  if (!fs.existsSync(".next")) return;

  for (const subdir of ["cache", "export"]) {
    const target = path.join(".next", subdir);
    if (!fs.existsSync(target)) continue;
    try {
      fs.rmSync(target, {
        recursive: true,
        force: true,
        maxRetries: 8,
        retryDelay: 250,
      });
    } catch {
      // Fall through — full .next removal below will surface a clear error.
    }
  }

  try {
    fs.rmSync(".next", {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 250,
    });
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : null;
    if (code === "ENOTEMPTY" || code === "EBUSY" || code === "EPERM") {
      console.error(
        "\nBuild blocked: .next is locked (pnpm dev is likely running).",
      );
      console.error(
        "Stop the dev server (Ctrl+C in that terminal), then run pnpm build again.\n",
      );
      process.exit(1);
    }
    throw error;
  }
}

if (guard) {
  await assertDevServerStopped();
}

cleanNextDir();
