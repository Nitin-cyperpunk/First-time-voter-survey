import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFieldNameToQKeyMap,
  buildFieldNameToQKeyMapFromSchema,
} from "@/lib/form-export/field-q-key-map";
import { parseFormExportSchemaFromHtml } from "@/lib/form-export/parse-html-schema";

const SAMPLE_HTML = `
  <div class="q" data-key="consent">
    <input type="radio" name="consent" value="Yes">
    <input type="radio" name="consent" value="No">
  </div>
  <div class="q" data-key="gender">
    <input type="radio" name="gender" value="Female">
    <input type="radio" name="gender" value="Male">
  </div>
  <div class="q" data-key="bq2_decider">
    <input type="radio" name="bq2_decider" value="Myself">
  </div>
  <div class="q" data-key="bq7_types">
    <input type="checkbox" name="bq7_types" value="Everyday bra">
    <input type="text" class="spec" name="bq7_types_other">
  </div>
  <div class="q" data-key="bq10_brands_used">
    <input type="text" name="bq10_brand_1">
    <input type="text" name="bq10_brand_2">
  </div>
`;

test("html field map matches schema field map for sample screener fields", () => {
  const htmlMap = buildFieldNameToQKeyMap(SAMPLE_HTML, { excludeCoreFields: true });
  const schema = parseFormExportSchemaFromHtml(SAMPLE_HTML, {
    excludeCoreFields: true,
  });
  const schemaMap = buildFieldNameToQKeyMapFromSchema(schema);

  for (const [fieldName, qKey] of schemaMap) {
    assert.equal(
      htmlMap.get(fieldName),
      qKey,
      `field ${fieldName} should map to ${qKey}`,
    );
  }
});

test("explicit data-q overrides sequential assignment without renumbering others", () => {
  const html = `
    <input type="radio" name="alpha" value="A">
    <input type="radio" name="beta" data-q="Q9" value="B">
    <input type="radio" name="gamma" value="C">
  `;

  const map = buildFieldNameToQKeyMap(html, { excludeCoreFields: false });

  assert.equal(map.get("alpha"), "Q1");
  assert.equal(map.get("beta"), "Q9");
  assert.equal(map.get("gamma"), "Q2");
});

test("registration core fields are excluded from html field map", () => {
  const html = `
    <input type="text" name="name">
    <input type="tel" name="phone">
    <input type="text" name="city">
    <input type="radio" name="consent" value="Yes">
  `;

  const map = buildFieldNameToQKeyMap(html, { excludeCoreFields: true });

  assert.equal(map.has("name"), false);
  assert.equal(map.has("phone"), false);
  assert.equal(map.has("city"), false);
  assert.equal(map.get("consent"), "Q1");
});

test("Q-key map is stable across repeated parses of the same HTML", () => {
  const first = buildFieldNameToQKeyMap(SAMPLE_HTML, { excludeCoreFields: true });
  const second = buildFieldNameToQKeyMap(SAMPLE_HTML, { excludeCoreFields: true });

  assert.deepEqual(
    Object.fromEntries(first),
    Object.fromEntries(second),
  );
});

test("parsed schema qKeys are stable across repeated HTML parses", () => {
  const first = parseFormExportSchemaFromHtml(SAMPLE_HTML, {
    excludeCoreFields: true,
  });
  const second = parseFormExportSchemaFromHtml(SAMPLE_HTML, {
    excludeCoreFields: true,
  });

  assert.equal(first.fields.length, second.fields.length);
  for (let index = 0; index < first.fields.length; index += 1) {
    assert.equal(first.fields[index]?.id, second.fields[index]?.id);
    assert.equal(first.fields[index]?.qKey, second.fields[index]?.qKey);
    assert.equal(
      first.fields[index]?.fieldName,
      second.fields[index]?.fieldName,
    );
  }
});

test("schema field map preserves per-version Q-keys for shared field names", () => {
  const htmlV1 = `
    <div class="q" data-key="age">
      <input type="radio" name="age_band" value="18-25">
    </div>
  `;
  const htmlV2 = `
    <div class="q" data-key="consent">
      <input type="radio" name="consent" value="Yes">
    </div>
    <div class="q" data-key="age">
      <input type="radio" name="age_band" value="18-25">
    </div>
  `;

  const schemaV1 = parseFormExportSchemaFromHtml(htmlV1, {
    excludeCoreFields: true,
  });
  const schemaV2 = parseFormExportSchemaFromHtml(htmlV2, {
    excludeCoreFields: true,
  });

  const ageV1 = schemaV1.fields.find((field) => field.id === "age");
  const ageV2 = schemaV2.fields.find((field) => field.id === "age");

  assert.equal(ageV1?.qKey, "Q1");
  assert.equal(ageV2?.qKey, "Q2");
  assert.equal(
    buildFieldNameToQKeyMapFromSchema(schemaV1).get("age_band"),
    "Q1",
  );
  assert.equal(
    buildFieldNameToQKeyMapFromSchema(schemaV2).get("age_band"),
    "Q2",
  );
});
