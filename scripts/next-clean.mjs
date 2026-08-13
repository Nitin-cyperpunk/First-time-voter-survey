import fs from "node:fs";
import net from "node:net";

const DEV_PORTS = [3000, 3001];
const guard = process.argv.includes("--guard");

function portInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function assertDevServerStopped() {
  for (const port of DEV_PORTS) {
    if (await portInUse(port)) {
      console.error(
        `\nBuild blocked: port ${port} is in use (pnpm dev is likely running).`,
      );
      console.error("Stop the dev server, then run pnpm build again.\n");
      process.exit(1);
    }
  }
}

if (guard) {
  await assertDevServerStopped();
}

fs.rmSync(".next", { recursive: true, force: true });
