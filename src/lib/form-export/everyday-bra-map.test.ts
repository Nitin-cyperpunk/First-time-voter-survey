import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildFieldNameToQKeyMap } from "@/lib/form-export/field-q-key-map";
import { injectFieldQKeyMap } from "@/lib/forms/inject-field-q-key-map";

test("Everyday Bra survey map ignores script template field names", () => {
  const html = readFileSync(
    join(process.cwd(), "public/form/Everyday Bra — Main Survey.html"),
    "utf8",
  );
  const withScriptTemplates =
    html +
    `\n<script>row.innerHTML=\`<input name="q1_brand_\${n}"><input name="\${name}">\`;</script>\n`;

  const map = buildFieldNameToQKeyMap(withScriptTemplates);
  for (const key of map.keys()) {
    assert.equal(key.includes("${"), false, `unexpected template key: ${key}`);
  }
  assert.equal(map.get("consent"), "Q1");
  assert.ok(map.get("q18a"));
  assert.ok(map.get("q25"));
});

test("injectFieldQKeyMap replaces a baked-in broken map", () => {
  const html = `<!DOCTYPE html><html><head>
  <script>window.__concaveFieldQKeyMap={"q1_brand_\${n}":"Q39"};</script>
  </head><body>
  <div class="q" data-key="consent"><input type="radio" name="consent" value="Yes"></div>
  </body></html>`;

  const injected = injectFieldQKeyMap(html);
  assert.equal(injected.includes('q1_brand_${n}'), false);
  assert.match(injected, /window\.__concaveFieldQKeyMap=\{"consent":"Q1"\}/);
});
