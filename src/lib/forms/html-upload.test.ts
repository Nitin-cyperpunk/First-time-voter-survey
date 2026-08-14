import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  buildUploadDiagnostics,
  decodeUploadedHtmlBytes,
  hasElementId,
  hasFieldName,
  hasShowResultFunction,
  injectRegistrationBridge,
  inspectRegistrationContract,
  looksLikeStandaloneFtvOriginal,
  prepareUploadedFormHtml,
  validateRegistrationHtml,
} from "@/lib/forms/html-upload";

const ftvHtml = readFileSync(
  path.join(process.cwd(), "public/form/first_time_voters_survey.html"),
  "utf8",
);

const surveycPath = path.join(
  process.cwd(),
  "public/form/first_time_voters_surveyc.html",
);
const surveycHtml = existsSync(surveycPath)
  ? readFileSync(surveycPath, "utf8")
  : null;

const downloadsPath = path.join(
  process.env.USERPROFILE ?? "",
  "Downloads",
  "first_time_voters_survey.html",
);

function stripThankyou(html: string) {
  return html.replace(/\bid=["']s-thankyou["']/gi, 'id="s-thanks-removed"');
}

function stripShowResult(html: string) {
  return html.replace(/\bfunction showResult\s*\(/g, "function showResultRemoved(");
}

test("anonymous FTV form satisfies the registration HTML contract", () => {
  assert.deepEqual(validateRegistrationHtml(ftvHtml), []);
});

test("contract matrix: city_id not required; showResult + s-thankyou required", () => {
  const checks = inspectRegistrationContract(ftvHtml);
  const byKey = Object.fromEntries(checks.map((c) => [c.key, c]));

  assert.equal(byKey.city_id?.required, false);
  assert.equal(byKey.city_id?.found, false);
  assert.equal(byKey.city?.found, true);
  assert.equal(byKey.showResult?.required, true);
  assert.equal(byKey.showResult?.found, true);
  assert.equal(byKey["s-thankyou"]?.required, true);
  assert.equal(byKey["s-thankyou"]?.found, true);

  assert.equal(byKey["s-terminate"]?.required, false);
  assert.equal(byKey["s-terminate"]?.found, true);
  assert.equal(byKey.age_band?.required, false);
  assert.equal(byKey.age_band?.found, true);
  assert.equal(byKey.name?.required, false);
  assert.equal(byKey.phone?.required, false);
  assert.equal(byKey.dob?.required, false);
  assert.equal(byKey.showScreen?.required, false);
  assert.equal(byKey.showScreen?.found, false);
});

test("hasElementId finds s-thankyou with class-before-id via tag parse", () => {
  const authored = `<div class="shell screen hidden" id="s-thankyou"></div>
<div class="shell screen hidden" id="s-terminate"></div>`;
  assert.equal(hasElementId(authored, "s-thankyou"), true);
  assert.equal(hasElementId(authored, "s-terminate"), true);
  assert.equal(hasElementId(ftvHtml, "s-thankyou"), true);
  assert.equal(hasElementId(ftvHtml, "s-terminate"), true);
  assert.equal(hasElementId("/* s-thankyou in a comment */", "s-thankyou"), false);
  assert.equal(hasElementId("#s-thankyou { display:block }", "s-thankyou"), false);
});

test("live form has free-text city, not city_id select", () => {
  assert.equal(hasFieldName(ftvHtml, "city_id"), false);
  assert.equal(hasFieldName(ftvHtml, "city"), true);
  assert.match(ftvHtml, /id=["']fCity["']/i);
  assert.doesNotMatch(ftvHtml, /id=["']fCityId["']/i);
});

test("showResult accepts declaration, assignment, and object method — not a call", () => {
  assert.equal(hasShowResultFunction(ftvHtml), true);
  assert.equal(
    hasShowResultFunction("function showResult(id){ return id; }"),
    true,
  );
  assert.equal(
    hasShowResultFunction("const showResult = function(id) {}"),
    true,
  );
  assert.equal(
    hasShowResultFunction("var api = { showResult: function(id) {} }"),
    true,
  );
  assert.equal(
    hasShowResultFunction(`finish(); showResult("s-thankyou");`),
    false,
  );
});

test("negative: removing s-thankyou fails only that check", () => {
  const html = stripThankyou(ftvHtml);
  const errors = validateRegistrationHtml(html);
  assert.deepEqual(errors, [
    "Missing required thank-you screen id: s-thankyou.",
  ]);
  assert.equal(hasShowResultFunction(html), true);
});

test("negative: removing showResult fails only that check", () => {
  const html = stripShowResult(ftvHtml);
  const errors = validateRegistrationHtml(html);
  assert.deepEqual(errors, ["Missing required function: showResult(id)."]);
  assert.equal(hasElementId(html, "s-thankyou"), true);
});

test("negative: omitting city_id still passes when showResult + thank-you exist", () => {
  const html = `
    <html><body>
      <input type="text" name="city" id="fCity">
      <div class="shell screen hidden" id="s-thankyou"></div>
      <script>
        function showResult(id) {
          document.getElementById(id).classList.remove("hidden");
        }
      </script>
    </body></html>
  `;
  assert.deepEqual(validateRegistrationHtml(html), []);
});

test("validator does not require age_band, name, phone, DOB, city_id, s-terminate, or showScreen", () => {
  const html = `
    <html><body>
      <div class="shell screen hidden" id="s-thankyou"></div>
      <script>
        function showResult(id) {
          document.getElementById(id).classList.remove("hidden");
        }
      </script>
    </body></html>
  `;
  assert.deepEqual(validateRegistrationHtml(html), []);
});

test("empty document reports only the two required checks", () => {
  const errors = validateRegistrationHtml("<html><body></body></html>");
  assert.deepEqual(errors, [
    "Missing required function: showResult(id).",
    "Missing required thank-you screen id: s-thankyou.",
  ]);
});

test(
  "Downloads FTV original fails required checks",
  { skip: !existsSync(downloadsPath) },
  () => {
    const html = readFileSync(downloadsPath, "utf8");
    const errors = validateRegistrationHtml(html);
    assert.ok(errors.includes("Missing required function: showResult(id)."));
    assert.ok(
      errors.includes("Missing required thank-you screen id: s-thankyou."),
    );
    assert.equal(errors.includes("Missing required field: city_id."), false);
  },
);

test(
  "first_time_voters_surveyc.html satisfies the live-submit contract",
  { skip: !surveycHtml },
  () => {
    assert.ok(surveycHtml);
    assert.equal(looksLikeStandaloneFtvOriginal(surveycHtml), false);
    assert.deepEqual(validateRegistrationHtml(surveycHtml), []);
    const prepared = prepareUploadedFormHtml(surveycHtml, "registration");
    assert.equal(hasFieldName(prepared, "city_id"), false);
    assert.equal(hasFieldName(prepared, "city"), true);
    assert.equal(hasElementId(prepared, "s-thankyou"), true);
    assert.equal(hasShowResultFunction(prepared), true);
    assert.match(prepared, /ConcaveRegistrationBridge\.attach\(showResult\)/);
    assert.equal(looksLikeStandaloneFtvOriginal(ftvHtml), false);
  },
);

test("standalone original detector flags fCity + innerHTML thank-you", () => {
  const html = `<input id="fCity"><script>
    function finish(){ shell.innerHTML = '<div class="end">thanks</div>'; }
  </script>`;
  assert.equal(looksLikeStandaloneFtvOriginal(html), true);
  const diag = buildUploadDiagnostics({
    html,
    bytes: Buffer.byteLength(html),
    encoding: "utf8",
    fileName: "first_time_voters_surveyc.html",
  });
  assert.match(diag.hint ?? "", /standalone/i);
});

test("unmodified first_time_voters_survey.html prepares with zero errors and no city_id", () => {
  const prepared = prepareUploadedFormHtml(ftvHtml, "registration");
  assert.equal(hasFieldName(prepared, "city_id"), false);
  assert.equal(hasFieldName(prepared, "city"), true);
  assert.equal(hasElementId(prepared, "s-thankyou"), true);
  assert.equal(hasShowResultFunction(prepared), true);
  assert.match(prepared, /ConcaveRegistrationBridge\.attach\(showResult\)/);
});

test("bridge attach accepts go(0) without showScreen(0)", () => {
  const html = `<!doctype html><html><head></head><body>
    <input name="city" id="fCity">
    <div id="s-thankyou"></div>
    <script>
      function showResult(id) {}
      function go(n) {}
      go(0);
    </script>
    </body></html>`;
  assert.deepEqual(validateRegistrationHtml(html), []);
  const prepared = prepareUploadedFormHtml(html, "registration");
  assert.match(prepared, /ConcaveRegistrationBridge\.attach\(showResult\)/);
});

test("UTF-16 LE BOM decode preserves contract fields", () => {
  const utf8 = `<input name="city" id="fCity"><div id="s-thankyou"></div><script>function showResult(id){}</script>`;
  const le = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(utf8, "utf16le"),
  ]);
  const decoded = decodeUploadedHtmlBytes(le);
  assert.equal(decoded.encoding, "utf16le-bom");
  assert.deepEqual(validateRegistrationHtml(decoded.html), []);
});

test("injectRegistrationBridge is idempotent", () => {
  const once = injectRegistrationBridge(ftvHtml);
  const twice = injectRegistrationBridge(once);
  assert.equal(
    (once.match(/ConcaveRegistrationBridge\.attach/g) ?? []).length,
    (twice.match(/ConcaveRegistrationBridge\.attach/g) ?? []).length,
  );
});
