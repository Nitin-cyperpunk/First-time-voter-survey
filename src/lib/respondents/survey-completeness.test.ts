import assert from "node:assert/strict";
import { test } from "node:test";

import {
  detectSurveyDataIncomplete,
  isSurveyDataComplete,
  isSurveyDataIncomplete,
} from "@/lib/respondents/survey-completeness";

test("explicit flag marks hollow", () => {
  assert.equal(
    isSurveyDataIncomplete({
      status: "completed",
      surveyDataIncomplete: true,
    }),
    true,
  );
});

test("live detection: empty answers and no payload", () => {
  assert.equal(
    detectSurveyDataIncomplete({
      status: "completed",
      screenerAnswers: {},
      ftvPayload: null,
    }),
    true,
  );
});

test("live detection: full payload is complete even if answers sparse", () => {
  assert.equal(
    isSurveyDataComplete({
      status: "completed",
      screenerAnswers: { Q1: "Name", Q2: "999" },
      ftvPayload: {
        responses: [{ qid: "Q3", answer: "Yes" }],
      },
    }),
    true,
  );
});
