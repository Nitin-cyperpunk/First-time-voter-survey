import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { validateRegistrationHtml } from "@/lib/forms/html-upload";

test("anonymous FTV form satisfies the registration HTML contract", () => {
  const html = readFileSync(
    path.join(process.cwd(), "public/form/first_time_voters_survey.html"),
    "utf8",
  );
  assert.deepEqual(validateRegistrationHtml(html), []);
});

test("validator no longer requires name, phone, or DOB", () => {
  const html = `
    <html><body>
      <select name="city_id"></select>
      <input name="age_band" value="18">
      <div id="s-thankyou"></div>
      <div id="s-terminate"></div>
      <script>
        function showResult(id) {
          document.querySelectorAll(".screen").forEach(function (s) {
            s.classList.add("hidden");
          });
          document.getElementById(id).classList.remove("hidden");
        }
      </script>
    </body></html>
  `;
  assert.deepEqual(validateRegistrationHtml(html), []);
});

test("validator reports missing city_id, age_band, showResult, and s-thankyou", () => {
  const errors = validateRegistrationHtml("<html><body></body></html>");
  assert.ok(errors.some((e) => e.includes("city_id")));
  assert.ok(errors.some((e) => e.includes("age_band")));
  assert.ok(errors.some((e) => e.includes("showResult")));
  assert.ok(errors.some((e) => e.includes("s-thankyou")));
  assert.ok(!errors.some((e) => e.includes("name")));
  assert.ok(!errors.some((e) => e.includes("phone")));
  assert.ok(!errors.some((e) => /dob/i.test(e)));
});
