import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildEverydayBraWideHeaders,
  EVERYDAY_BRA_WIDE_HEADERS,
  mapEverydayBraAnswersToWideRow,
} from "@/lib/survey-export/everyday-bra-wide";
import { wideHeader } from "@/lib/survey-export/everyday-bra-wide/questionnaire";

test("generated wide headers match golden sample (1171, exact order+text)", () => {
  const generated = buildEverydayBraWideHeaders();
  assert.equal(generated.length, 1171);
  assert.equal(EVERYDAY_BRA_WIDE_HEADERS.length, 1171);

  const diffs: string[] = [];
  const max = Math.max(generated.length, EVERYDAY_BRA_WIDE_HEADERS.length);
  for (let i = 0; i < max; i++) {
    if (generated[i] !== EVERYDAY_BRA_WIDE_HEADERS[i]) {
      diffs.push(
        `#${i}\n  gen: ${generated[i] ?? "<missing>"}\n  gold: ${EVERYDAY_BRA_WIDE_HEADERS[i] ?? "<missing>"}`,
      );
    }
  }
  assert.equal(
    diffs.length,
    0,
    `Header mismatches (${diffs.length}):\n${diffs.slice(0, 20).join("\n")}`,
  );
});

test("maps stored answers into expanded multi and matrix columns", () => {
  const row = mapEverydayBraAnswersToWideRow(
    {
      consent: "Yes",
      q1_brand_1: "Enamor",
      q1_brand_2: "Jockey",
      q2_aware: ["Enamor", "Jockey", "Zudio"],
      q2_other1: "Enamor Athleisure",
      q8_0: "1",
      q8_1: "5",
      q8_0_own: "4",
      q10_0: ["Enamor"],
      q18a: ["Switched expensive"],
      q30_band: "34",
      q30_cup: "B",
      q30_full: "34B",
    },
    {
      leadId: "ENM-TEST",
      status: "complete",
      surveyVersion: "v5",
      durationMinutes: 13.4,
      lastScreenReached: "s-m13",
    },
  );

  assert.equal(row["Respondent ID"], "ENM-TEST");
  assert.equal(
    row["Consent. Do you consent to participate in this exercise?"],
    "Yes",
  );
  assert.equal(row[wideHeader("Q1", "Mention 1")], "Enamor");
  assert.equal(row[wideHeader("Q1", "Mention 2")], "Jockey");
  assert.equal(row[wideHeader("Q2", "Enamor")], "Enamor");
  assert.equal(row[wideHeader("Q2", "Triumph")], "");
  assert.equal(row[wideHeader("Q2", "Other brand 1 (typed)")], "Enamor Athleisure");
  assert.equal(row[wideHeader("Q8", "T-shirt bra")], "Buy more now");
  assert.equal(row[wideHeader("Q8", "Push-up")], "Never bought");
  assert.equal(row[wideHeader("Q8a", "T-shirt bra")], "4");
  assert.equal(row[wideHeader("Q10", "T-shirt bra", "Enamor")], "Enamor");
  assert.equal(
    row[wideHeader("Q15a", "I switched to a more expensive brand")],
    "I switched to a more expensive brand",
  );
  assert.equal(row[wideHeader("Q28", "Band size")], "34");
  assert.equal(row[wideHeader("Q28", "Cup size")], "B");
  assert.equal(row[wideHeader("Q28", "Full size")], "34B");
  assert.equal(Object.keys(row).length, 1171);
});

test("maps nested Q35 size array into Q28 band/cup/full columns", () => {
  const row = mapEverydayBraAnswersToWideRow(
    {
      Q35: ["32", "A", "32A"],
      Q33: "search terms",
      Q34: "some creator",
    },
    { leadId: "ENM-SIZE", status: "complete" },
  );

  assert.equal(row[wideHeader("Q28", "Band size")], "32");
  assert.equal(row[wideHeader("Q28", "Cup size")], "A");
  assert.equal(row[wideHeader("Q28", "Full size")], "32A");
  assert.equal(row[wideHeader("Q26")], "search terms");
  assert.equal(row[wideHeader("Q27")], "some creator");
  // Scalar Q30 is dream brand (Q23), not size
  const dream = mapEverydayBraAnswersToWideRow(
    { Q30: "jockey", Q35: ["34", "B", "34B"] },
    { leadId: "ENM-SIZE2", status: "complete" },
  );
  assert.equal(dream[wideHeader("Q23")], "jockey");
  assert.equal(dream[wideHeader("Q28", "Band size")], "34");
});
