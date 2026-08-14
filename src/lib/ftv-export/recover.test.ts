import assert from "node:assert/strict";
import { test } from "node:test";

import { recoverFtvAnswers, recoverFtvRespondent } from "@/lib/ftv-export/recover";

test("recovers FTV answers from analytics.__ftv_payload including padded Q6b_10", () => {
  const answers = recoverFtvAnswers("CI_FTV_0059", {
    answers: {},
    analytics: {
      __ftv_payload: {
        status: "COMPLETE",
        responses: [
          { qid: "Q1", type: "single", answer: "Yes", answer_code: 1 },
          { qid: "Q6b_1", type: "grid", item_code: 1, answer_code: 4 },
          { qid: "Q6b_9", type: "grid", item_code: 9, answer_code: 4 },
        ],
      },
    },
  });
  assert.equal(answers.some((row) => row.qid === "Q6b_10"), true);
  assert.equal(answers.find((row) => row.qid === "Q1")?.answer, "Yes");
});

test("maps FTV-shaped Q1/Q2 keys and skips other-instrument Q18+ maps", () => {
  const ftvShaped = recoverFtvAnswers("CI_FTV_0004", {
    answers: { Q1: "Yes", Q2: "Yes" },
    analytics: {},
  });
  assert.deepEqual(
    ftvShaped.map((row) => row.qid),
    ["Q1", "Q2"],
  );

  const otherInstrument = recoverFtvAnswers("CI_EN_0001", {
    answers: { Q1: "Yes", Q11: "BJP", Q18: "4" },
    analytics: {},
  });
  assert.deepEqual(otherInstrument, []);
});

test("builds an export respondent from participant + unmatched screener", () => {
  const row = recoverFtvRespondent({
    screener: {
      lead_id: "CI_FTV_0012",
      city_id: null,
      city_raw: "Hyderabad",
      city_match_type: "unmatched",
      answers: {},
      analytics: {
        __ftv_payload: {
          status: "COMPLETE",
          survey_version: "FTV-v1",
          profile: { name: "A", city: "Hyderabad" },
          responses: [{ qid: "Q1", type: "single", answer: "Yes" }],
        },
      },
      started_at: "2026-08-01T00:00:00.000Z",
      submitted_at: "2026-08-01T00:10:00.000Z",
      total_duration_sec: 600,
    },
    participant: {
      lead_id: "CI_FTV_0012",
      full_name: "A",
      email: null,
      mobile: "999",
      city: "Hyderabad",
      city_id: null,
      area: null,
      pincode: null,
      dob: null,
      created_at: "2026-08-01T00:00:00.000Z",
    },
  });
  assert.equal(row.respondent_id, "CI_FTV_0012");
  assert.equal(row.city_id, null);
  assert.equal(row.city, "Hyderabad");
  assert.equal(row.status, "COMPLETE");
});
