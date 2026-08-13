import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSurveyResponseDocument,
  extractQuestionAnswers,
  extractScreenTimes,
  isLegacyFlatAnswerMap,
  isSurveyResponseDocument,
  normalizeSurveyResponseDocument,
  sanitizeSurveyAnswers,
} from "@/lib/survey-response-document";

test("legacy flat answers normalize into answers object", () => {
  const legacy = {
    Q1: "Yes",
    Q2: "18-24",
    Q3: "Female",
  };

  assert.equal(isLegacyFlatAnswerMap(legacy), true);
  assert.deepEqual(extractQuestionAnswers(legacy), legacy);

  const normalized = normalizeSurveyResponseDocument(legacy, {
    legacyResponseTimes: { Q1: 12, Q2: 18 },
  });

  assert.equal(normalized.answers.Q1, "Yes");
  assert.equal(normalized.answers.Q2, "18-24");
  assert.deepEqual(normalized._screen_times, { Q1: 12, Q2: 18 });
});

test("structured document round-trips through extractors", () => {
  const document = buildSurveyResponseDocument({
    leadId: "LD1002",
    participant: { fullName: "John", city: "Bareilly" },
    screenerAnswers: {
      gender: "Male",
      area: "CB Ganj",
      zip: "243502",
    },
    surveyVersion: 3,
    answers: {
      Q1: "Yes",
      Q15: ["A", "B"],
      Q22: { "1": "Good", "2": "Average" },
    },
    screenTimes: { Q1: 12, Q2: 17 },
    currentScreen: "Q18",
    lastScreen: "Q42",
  });

  assert.equal(isSurveyResponseDocument(document), true);
  assert.equal(document.respondent_name, "John");
  assert.equal(document.city, "Bareilly");
  assert.equal(document.gender, "Male");
  assert.equal(document.area, "CB Ganj");
  assert.equal(document.zipcode, "243502");
  assert.equal(document.lead_id, "LD1002");
  assert.equal(document.survey_version, "v3");
  assert.equal(document.current_screen, "Q18");
  assert.equal(document._last_screen, "Q42");
  assert.deepEqual(document.journey, { before: [], after: [] });
  assert.deepEqual(extractQuestionAnswers(document), {
    Q1: "Yes",
    Q15: ["A", "B"],
    Q22: { "1": "Good", "2": "Average" },
  });
  assert.deepEqual(extractScreenTimes(document), { Q1: 12, Q2: 17 });
  assert.deepEqual(
    (document.answers as Record<string, unknown>)._st,
    { Q1: 12, Q2: 17 },
  );
});

test("sanitizeSurveyAnswers preserves arrays and nested objects", () => {
  const sanitized = sanitizeSurveyAnswers({
    Q15: ["A", "B"],
    Q22: { "1": "Good", "2": "Average" },
    Q23: "",
    respondent_name: "should be ignored",
  });

  assert.deepEqual(sanitized.Q15, ["A", "B"]);
  assert.deepEqual(sanitized.Q22, { "1": "Good", "2": "Average" });
  assert.equal(sanitized.Q23, undefined);
  assert.equal(sanitized.respondent_name, undefined);
});

test("new document initializes journey and comparison placeholders", () => {
  const document = buildSurveyResponseDocument({
    leadId: "LD1002",
    participant: { fullName: "John", city: "Bareilly" },
    answers: { Q1: "Yes" },
  });

  assert.deepEqual(document.journey, { before: [], after: [] });
  assert.deepEqual(document.comparison, { brand: "", type: "", when: "" });
});

test("extractScreenTimes falls back to legacy response_times column", () => {
  const legacy = { Q1: "Yes" };
  assert.deepEqual(extractScreenTimes(legacy, { Q1: 9, Q2: 4 }), {
    Q1: 9,
    Q2: 4,
  });
});

test("buildSurveyResponseDocument populates comparison from schema field names", () => {
  const document = buildSurveyResponseDocument({
    leadId: "LD1002",
    participant: { fullName: "John", city: "Bareilly" },
    answers: {
      Q10: "BJP",
      Q11: "BJP",
      Q12: "2-3 months",
    },
    surveySchema: {
      version: 1,
      fields: [
        {
          id: "recent_brand",
          qKey: "Q10",
          label: "Party voted for",
          type: "text",
          fieldName: "recent_brand",
        },
        {
          id: "party",
          qKey: "Q11",
          label: "Party",
          type: "text",
          fieldName: "party",
        },
        {
          id: "last_purchase",
          qKey: "Q12",
          label: "Last purchase",
          type: "text",
          fieldName: "last_purchase_when",
        },
      ],
    },
  });

  assert.equal(document.comparison.brand, "BJP");
  assert.equal(document.comparison.type, "BJP");
  assert.equal(document.comparison.when, "2-3 months");
});
