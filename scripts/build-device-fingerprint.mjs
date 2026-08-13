import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientJsPath = path.join(
  root,
  "node_modules",
  "clientjs",
  "dist",
  "client.min.js",
);
const outPath = path.join(root, "public", "forms", "device-fingerprint.js");

const clientJs = fs.readFileSync(clientJsPath, "utf8");

const wrapper = `
(function () {
  "use strict";

  var cached = undefined;
  var pending = null;

  function generateFingerprint() {
    try {
      var client = new ClientJS();
      return String(client.getFingerprint());
    } catch (error) {
      console.warn("[ConcaveDeviceFingerprint] generation failed:", error);
      return null;
    }
  }

  function getDeviceFingerprint() {
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    if (pending) {
      return pending;
    }

    pending = Promise.resolve().then(function () {
      cached = generateFingerprint();
      pending = null;
      return cached;
    });

    return pending;
  }

  function prime() {
    void getDeviceFingerprint();
  }

  window.ConcaveDeviceFingerprint = {
    get: getDeviceFingerprint,
    prime: prime,
  };
})();
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${clientJs}\n${wrapper}`);
console.log("Wrote public/forms/device-fingerprint.js");
