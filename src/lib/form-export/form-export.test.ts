import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildExportRow,
  buildExportRows,
  buildNormalizedExport,
  mergeExportSchemas,
  RESPONDENT_ID_HEADER,
} from "@/lib/form-export";
import { parseFormExportSchemaFromHtml } from "@/lib/form-export/parse-html-schema";
import type { FormExportSchema } from "@/lib/form-export/types";

const schema: FormExportSchema = {
  version: 1,
  fields: [
    {
      id: "age",
      qKey: "Q1",
      label: "What is your age?",
      type: "single_select",
      fieldName: "age_band",
      options: ["18-25", "26-35"],
    },
    {
      id: "brands",
      qKey: "Q2",
      label: "Which brands have you purchased?",
      type: "multiple_select",
      fieldName: "brands",
      options: ["Enamor", "Jockey", "Zivame", "Triumph", "Other"],
      otherOption: "Other",
      otherSpecifyField: "brands_other",
      otherKey: "Q3",
    },
    {
      id: "importance",
      qKey: "Q4",
      label: "Rate the following",
      type: "matrix",
      fieldName: "importance",
      rows: [
        { label: "Comfort", fieldName: "rate_comfort", qKey: "Q4" },
        { label: "Fit", fieldName: "rate_fit", qKey: "Q5" },
        { label: "Design", fieldName: "rate_design", qKey: "Q7" },
      ],
    },
  ],
};

test("single select exports one question column", () => {
  const normalized = buildNormalizedExport({
    schema,
    answers: { Q1: "18-25" },
    fieldAnswers: {},
  });

  assert.equal(normalized["What is your age?"], "18-25");
});

test("multiple select exports one column per option", () => {
  const normalized = buildNormalizedExport({
    schema,
    answers: { Q2: ["Enamor", "Jockey", "Triumph"] },
    fieldAnswers: {},
  });

  assert.equal(
    normalized["Which brands have you purchased? - Enamor"],
    "Enamor",
  );
  assert.equal(
    normalized["Which brands have you purchased? - Jockey"],
    "Jockey",
  );
  assert.equal(normalized["Which brands have you purchased? - Zivame"], "");
  assert.equal(
    normalized["Which brands have you purchased? - Triumph"],
    "Triumph",
  );
  assert.equal(normalized["Which brands have you purchased? - Other"], "");
  assert.equal(
    normalized["Which brands have you purchased? - Other Specify Text"],
    "",
  );
});

test("other specify uses Variant A: Other column + Other Specify Text", () => {
  const normalized = buildNormalizedExport({
    schema,
    answers: { Q2: ["Enamor", "Other"], Q3: "Custom brand" },
    fieldAnswers: { brands_other: "Custom brand" },
  });

  assert.equal(
    normalized["Which brands have you purchased? - Enamor"],
    "Enamor",
  );
  assert.equal(
    normalized["Which brands have you purchased? - Other"],
    "Other",
  );
  assert.equal(
    normalized["Which brands have you purchased? - Other Specify Text"],
    "Custom brand",
  );
});

test("matrix exports one column per row with rating", () => {
  const normalized = buildNormalizedExport({
    schema,
    answers: {
      Q4: "Very Important",
      Q5: "Important",
      Q7: "Neutral",
    },
    fieldAnswers: {},
  });

  assert.equal(normalized["Rate the following - Comfort"], "Very Important");
  assert.equal(normalized["Rate the following - Fit"], "Important");
  assert.equal(normalized["Rate the following - Design"], "Neutral");
});

test("export row starts with Respondent ID and expands all types", () => {
  const normalized = buildNormalizedExport({
    schema,
    answers: {
      Q1: "18-25",
      Q2: ["Enamor", "Others - Acme"],
      Q4: "Very Important",
      Q5: "Important",
      Q7: "Neutral",
    },
    fieldAnswers: {},
  });

  const row = buildExportRow({
    leadId: "CI_EN_0001",
    schema,
    normalized,
  });

  assert.equal(row[RESPONDENT_ID_HEADER], "CI_EN_0001");
  assert.equal(row["What is your age?"], "18-25");
  assert.equal(row["Which brands have you purchased? - Enamor"], "Enamor");
  assert.equal(row["Which brands have you purchased? - Other"], "Other");
  assert.equal(
    row["Which brands have you purchased? - Other Specify Text"],
    "Acme",
  );
  assert.equal(row["Rate the following - Comfort"], "Very Important");
});

test("open-multi exports one comma-separated column", () => {
  const openMultiSchema: FormExportSchema = {
    version: 1,
    fields: [
      {
        id: "bq10_brands_used",
        qKey: "Q42",
        label: "Write the names of everyday bra brands you personally use.",
        type: "open_multi",
        fieldName: "bq10_brand_1",
        boxes: [
          { label: "Brand 1", fieldName: "bq10_brand_1", qKey: "Q42" },
          { label: "Brand 2 (optional)", fieldName: "bq10_brand_2", qKey: "Q43" },
        ],
      },
    ],
  };

  const normalized = buildNormalizedExport({
    schema: openMultiSchema,
    answers: {
      Q42: "Enamor",
      Q43: "Jockey",
    },
    fieldAnswers: {},
  });

  assert.equal(
    normalized[
      "Write the names of everyday bra brands you personally use."
    ],
    "Enamor, Jockey",
  );
});

test("repeat exports as one JSON column", () => {
  const repeatSchema: FormExportSchema = {
    version: 1,
    fields: [
      {
        id: "purchase_loop",
        qKey: "Q10",
        label: "Repeat purchases",
        type: "repeat",
      },
    ],
  };

  const normalized = buildNormalizedExport({
    schema: repeatSchema,
    answers: {
      q10: [
        { Loan: "Bajaj", Status: "Completed" },
        { Loan: "HDB", Status: "Active" },
      ],
    },
    fieldAnswers: {},
  });

  assert.equal(
    normalized["Repeat purchases"],
    JSON.stringify([
      { Loan: "Bajaj", Status: "Completed" },
      { Loan: "HDB", Status: "Active" },
    ]),
  );
});

test("parse-html-schema reads data-other-inline into otherInline", () => {
  const html = `
    <div class="q" data-key="brands" data-other-inline="false">
      <label class="q-label">Brands</label>
      <div class="opts" data-multi="brands" data-other="Other">
        <input type="checkbox" name="brands" value="Enamor">
        <input type="checkbox" name="brands" value="Other">
        <input type="text" class="spec" name="brands_other">
      </div>
    </div>
  `;

  const parsed = parseFormExportSchemaFromHtml(html, { excludeCoreFields: false });
  const brands = parsed.fields.find((field) => field.id === "brands");

  assert.equal(brands?.otherInline, false);
  assert.equal(brands?.exportOtherSpecifySeparately, true);
});

test("cross-form_version export merges columns and maps each row to its schema", () => {
  const schemaV1: FormExportSchema = {
    version: 1,
    fields: [
      {
        id: "age",
        qKey: "Q1",
        label: "Age",
        type: "single_select",
        fieldName: "age_band",
        options: ["18-25", "26-35"],
      },
    ],
  };

  const schemaV2: FormExportSchema = {
    version: 1,
    fields: [
      {
        id: "consent",
        qKey: "Q1",
        label: "Consent",
        type: "single_select",
        fieldName: "consent",
        options: ["Yes", "No"],
      },
      {
        id: "age",
        qKey: "Q2",
        label: "Age",
        type: "single_select",
        fieldName: "age_band",
        options: ["18-25", "26-35"],
      },
    ],
  };

  const mergedSchema = mergeExportSchemas([schemaV1, schemaV2]);

  const rows = buildExportRows({
    schema: mergedSchema,
    responses: [
      {
        leadId: "CI_EN_0001",
        normalized: buildNormalizedExport({
          schema: schemaV1,
          answers: { Q1: "18-25" },
          fieldAnswers: {},
        }),
      },
      {
        leadId: "CI_EN_0002",
        normalized: buildNormalizedExport({
          schema: schemaV2,
          answers: { Q1: "Yes", Q2: "26-35" },
          fieldAnswers: {},
        }),
      },
    ],
  });

  assert.equal(rows[0]?.["Age"], "18-25");
  // Merged schema includes Consent from V2; V1 respondents leave it blank.
  assert.equal(rows[0]?.["Consent"], "");
  assert.equal(rows[1]?.["Consent"], "Yes");
  assert.equal(rows[1]?.["Age"], "26-35");
});

test("excludeCoreFields omits registration PII blocks from export schema", () => {
  const html = `
    <div class="q" data-key="consent">
      <label class="q-label">Consent</label>
      <input type="radio" name="consent" value="Yes">
      <input type="radio" name="consent" value="No">
    </div>
    <div class="q" data-key="name"><label class="q-label">Name</label><input type="text" name="name"></div>
    <div class="q" data-key="phone"><label class="q-label">Phone</label><input type="tel" name="phone"></div>
    <div class="q" data-key="gender">
      <label class="q-label">Gender</label>
      <input type="radio" name="gender" value="Female">
    </div>
  `;

  const parsed = parseFormExportSchemaFromHtml(html, { excludeCoreFields: true });
  const ids = parsed.fields.map((field) => field.id);

  assert.deepEqual(ids, ["consent", "gender"]);
  assert.equal(parsed.fields.find((field) => field.id === "consent")?.qKey, "Q1");
  assert.equal(parsed.fields.find((field) => field.id === "gender")?.qKey, "Q4");
});

test("label drift across versions still resolves via storage keys", () => {
  const schemaV1: FormExportSchema = {
    version: 1,
    fields: [
      {
        id: "consent",
        qKey: "Q1",
        label: "Consent",
        type: "single_select",
        fieldName: "consent",
      },
    ],
  };
  const schemaV2: FormExportSchema = {
    version: 1,
    fields: [
      {
        id: "consent",
        qKey: "Q1",
        label: "Consent updated wording",
        type: "single_select",
        fieldName: "consent",
      },
    ],
  };

  const merged = mergeExportSchemas([schemaV1, schemaV2]);
  assert.equal(merged.fields.length, 1);
  assert.equal(merged.fields[0]?.label, "Consent");

  const normalized = buildNormalizedExport({
    schema: schemaV2,
    answers: { Q1: "Yes" },
    fieldAnswers: {},
  });

  const row = buildExportRow({
    leadId: "LD1",
    schema: merged,
    normalized,
  });

  // Merged schema keeps V1 label; storage key alias carries the answer.
  assert.equal(row["Consent"], "Yes");
});

test("object-shaped multi-select without options falls back to JSON cell", () => {
  const multiSchema: FormExportSchema = {
    version: 1,
    fields: [
      {
        id: "fin_invest",
        qKey: "Q35",
        label: "Investments",
        type: "multiple_select",
        fieldName: "fin_invest",
      },
    ],
  };

  const normalized = buildNormalizedExport({
    schema: multiSchema,
    answers: { Q35: { International: "Yes", Domestic: "No" } },
    fieldAnswers: {},
  });

  assert.equal(
    normalized["Investments"],
    JSON.stringify({ International: "Yes", Domestic: "No" }),
  );
});
