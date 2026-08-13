import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parseFormExportSchemaFromHtml } from "@/lib/form-export/parse-html-schema";
import { foldRuntimeFieldAnswers } from "@/lib/survey-export/fold-runtime-fields";
import { nestAnswersByQuestion } from "@/lib/survey-export/nest-by-question";
import { findAnswerForQKey } from "@/lib/survey-export/q-key";
import { formatAnswerForExportCell } from "@/lib/survey-export/question-format";

const SAMPLE_ANSWERS = {
  Q1: "Yes",
  Q3: ["Zudio"],
  Q19: ["Switched expensive"],
  Q30: "zudio",
  Q33: "latest",
  q1_brand_1: "jockey",
  q1_brand_2: "enamor",
  q1_brand_3: "adidas",
  q8_0: "5",
  q8_3: "1",
  q8_3_own: "2",
  q8_3_switch: "Yes, I tried another brand, but switched back to my previous brand.",
  q9_3: "1",
  q10_3: ["Zudio"],
  q11_3: "₹500-599",
  q12_3: ["Exclusive brand store", "E-commerce"],
  q13_3: "3-4 times a week",
  q13when_3: "Within 3 months",
  q17_1: "₹500-599",
  q19_18: "Somewhat important",
  q20_18: "Zudio",
  q24_17: "Wouldn't pay extra",
  q30_band: "32",
  q30_cup: "B",
};

test("foldRuntimeFieldAnswers nests dynamic Everyday Bra keys under parent Q-keys", () => {
  const html = readFileSync(
    join(process.cwd(), "public/form/Everyday Bra — Main Survey.html"),
    "utf8",
  );
  const schema = parseFormExportSchemaFromHtml(html);
  assert.ok(schema.fields.length > 10);

  const byId = new Map(schema.fields.map((field) => [field.id, field]));
  assert.ok(byId.get("q1_recall"));
  assert.ok(byId.get("q8_matrix"));
  assert.ok(byId.get("q30"));

  const folded = foldRuntimeFieldAnswers(SAMPLE_ANSWERS, schema);
  const recallKey = byId.get("q1_recall")!.qKey;
  const matrixKey = byId.get("q8_matrix")!.qKey;
  const ownedKey = byId.get("q8a_owned")!.qKey;
  const sizeKey = byId.get("q30")!.qKey;

  assert.deepEqual(folded[recallKey], ["jockey", "enamor", "adidas"]);
  assert.equal(typeof folded[matrixKey], "object");
  assert.equal((folded[matrixKey] as Record<string, string>)["0"], "5");
  assert.equal((folded[matrixKey] as Record<string, string>)["3"], "1");
  assert.equal((folded[ownedKey] as Record<string, string>)["3"], "2");
  // Size fields stay for nestOpenMulti when schema has band/cup/full boxes.
  assert.equal(folded.q30_band, "32");
  assert.equal(folded.q30_cup, "B");
  assert.equal(folded[sizeKey], undefined);
  assert.equal(folded.q1_brand_1, undefined);
  assert.equal(folded.q8_0, undefined);
});

test("nestAnswersByQuestion keeps folded matrices exportable as JSON cells", () => {
  const html = readFileSync(
    join(process.cwd(), "public/form/Everyday Bra — Main Survey.html"),
    "utf8",
  );
  const schema = parseFormExportSchemaFromHtml(html);
  const nested = nestAnswersByQuestion(SAMPLE_ANSWERS, schema);
  const matrix = schema.fields.find((field) => field.id === "q8_matrix")!;
  const recall = schema.fields.find((field) => field.id === "q1_recall")!;
  const size = schema.fields.find((field) => field.id === "q30")!;

  const matrixValue = findAnswerForQKey(nested, matrix.qKey);
  const recallValue = findAnswerForQKey(nested, recall.qKey);
  const sizeValue = findAnswerForQKey(nested, size.qKey);

  assert.ok(matrixValue && typeof matrixValue === "object");
  assert.deepEqual(recallValue, ["jockey", "enamor", "adidas"]);
  assert.ok(sizeValue);
  assert.match(formatAnswerForExportCell(sizeValue, size.type), /32/);

  const matrixCell = formatAnswerForExportCell(matrixValue, "matrix");
  assert.match(matrixCell, /"0":"5"/);
  assert.match(matrixCell, /"3":"1"/);

  const recallCell = formatAnswerForExportCell(recallValue, "open_multi");
  assert.equal(recallCell, "jockey, enamor, adidas");
});

test("bra size q30_band/cup/full nests into parent and stays exportable", () => {
  const html = readFileSync(
    join(process.cwd(), "public/form/Everyday Bra — Main Survey.html"),
    "utf8",
  );
  const schema = parseFormExportSchemaFromHtml(html);
  const sizeField = schema.fields.find((field) => field.id === "q30");
  assert.ok(sizeField);
  assert.ok((sizeField.boxes?.length ?? 0) >= 2);

  const nested = nestAnswersByQuestion(
    {
      q30_band: "32",
      q30_cup: "B",
      q30_full: "32B",
    },
    schema,
  );

  const value = findAnswerForQKey(nested, sizeField.qKey);
  assert.ok(value);
  const cell = formatAnswerForExportCell(value, sizeField.type);
  assert.match(cell, /32/);
  assert.equal(nested.q30_band, undefined);
});

test("pre-folded size string is not wiped by nestOpenMulti", () => {
  const html = readFileSync(
    join(process.cwd(), "public/form/Everyday Bra — Main Survey.html"),
    "utf8",
  );
  const schema = parseFormExportSchemaFromHtml(html);
  const sizeField = schema.fields.find((field) => field.id === "q30")!;
  const nested = nestAnswersByQuestion(
    { [sizeField.qKey]: "34C" },
    schema,
  );
  const value = findAnswerForQKey(nested, sizeField.qKey);
  const cell = formatAnswerForExportCell(value, sizeField.type);
  assert.match(cell, /34C/);
});
