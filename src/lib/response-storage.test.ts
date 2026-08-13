import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isQKey,
  validateResponseTimes,
  validateScreenerSubmission,
} from "@/lib/response-storage";

test("isQKey accepts FTV screener and sub-item codes", () => {
  for (const key of ["Q1", "Q15", "QC", "QD", "QA", "Q15_1", "Q6a_1", "Q7_rank1"]) {
    assert.equal(isQKey(key), true, key);
  }
});

test("isQKey rejects field names and metadata", () => {
  for (const key of ["consent", "qa_state", "name", "q3_party", "city_id"]) {
    assert.equal(isQKey(key), false, key);
  }
});

test("validateResponseTimes accepts QC timing keys", () => {
  const result = validateResponseTimes({ QC: 4, QD: 2, Q1: 8, Q15_1: 3 });
  assert.deepEqual(result, { ok: true });
});

test("validateScreenerSubmission allows FTV keys plus consent metadata", () => {
  const result = validateScreenerSubmission(
    {
      QC: "Woman",
      QD: "Single",
      Q1: "Yes",
      Q15_1: "Delhi",
      consent: "Agree",
    },
    { QC: 4, QD: 2, Q1: 8, Q15_1: 0 },
  );
  assert.deepEqual(result, { ok: true });
});

test("validateScreenerSubmission still rejects unknown time keys", () => {
  const result = validateScreenerSubmission({ Q1: "Yes" }, { name: 3 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /Invalid response time key: name/);
  }
});
