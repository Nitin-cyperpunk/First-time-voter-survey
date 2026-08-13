import assert from "node:assert/strict";
import { test } from "node:test";

import type { FormExportSchema } from "@/lib/form-export/types";

import { nestAnswersByQuestion } from "@/lib/survey-export/nest-by-question";

const surveySchema: FormExportSchema = {
  version: 1,
  fields: [
    {
      id: "fitness",
      qKey: "Q30",
      label: "Fitness activities",
      type: "multiple_select",
      fieldName: "fitness",
      otherOption: "Other",
      otherKey: "Q31",
      otherSpecifyField: "fitness_other",
    },
    {
      id: "bq6_types",
      qKey: "Q37",
      label: "Parties mentioned",
      type: "multiple_select",
      fieldName: "bq6_types",
      otherOption: "Other",
      otherKey: "Q38",
      otherSpecifyField: "bq6_types_other",
    },
    {
      id: "q3_party",
      qKey: "Q42",
      label: "Parties mentioned",
      type: "open_multi",
      fieldName: "q3_party_1",
      boxes: [
        { label: "Brand 1", fieldName: "q3_party_1", qKey: "Q42" },
        { label: "Brand 2", fieldName: "q3_party_2", qKey: "Q43" },
        { label: "Brand 3", fieldName: "q3_party_3", qKey: "Q44" },
        { label: "Brand 4", fieldName: "q3_party_4", qKey: "Q45" },
      ],
    },
    {
      id: "q3_party",
      qKey: "Q46",
      label: "Party voted for",
      type: "single_select",
      fieldName: "q3_party",
    },
  ],
};

test("nestAnswersByQuestion merges other-specify fields into parent multi-select", () => {
  const nested = nestAnswersByQuestion(
    {
      Q30: ["Exercise/Gym", "Sports", "Yoga", "Other"],
      Q31: "Kickboxing",
    },
    surveySchema,
  );

  assert.deepEqual(nested.Q30, [
    "Exercise/Gym",
    "Sports",
    "Yoga",
    "Others - Kickboxing",
  ]);
  assert.equal(nested.Q31, undefined);
});

test("nestAnswersByQuestion merges other specify into Q37", () => {
  const nested = nestAnswersByQuestion(
    {
      Q37: ["BJP", "Other"],
      Q38: "Independent",
    },
    surveySchema,
  );

  assert.deepEqual(nested.Q37, [
    "BJP",
    "Others - Independent",
  ]);
  assert.equal(nested.Q38, undefined);
});

test("nestAnswersByQuestion collapses open-multi textboxes into one array", () => {
  const nested = nestAnswersByQuestion(
    {
      Q42: "BJP",
      Q43: "Congress",
      Q44: "SP",
      Q45: "DMK",
    },
    surveySchema,
  );

  assert.deepEqual(nested.Q42, ["BJP", "Congress", "SP", "DMK"]);
  assert.equal(nested.Q43, undefined);
  assert.equal(nested.Q44, undefined);
  assert.equal(nested.Q45, undefined);
});

test("nestAnswersByQuestion skips empty open-multi boxes", () => {
  const nested = nestAnswersByQuestion(
    {
      Q42: "BJP",
      Q43: "Congress",
      Q44: "SP",
      Q45: "",
    },
    surveySchema,
  );

  assert.deepEqual(nested.Q42, ["BJP", "Congress", "SP"]);
});

test("nestAnswersByQuestion keeps independent single-select questions separate", () => {
  const nested = nestAnswersByQuestion(
    {
      Q42: "BJP",
      Q43: "Congress",
      Q46: "SP",
    },
    surveySchema,
  );

  assert.equal(nested.Q46, "SP");
});

test("nestAnswersByQuestion produces the full expected survey shape", () => {
  const nested = nestAnswersByQuestion(
    {
      Q30: ["Exercise/Gym", "Sports", "Yoga", "Other"],
      Q31: "Kickboxing",
      Q37: ["BJP", "Congress", "Other"],
      Q38: "Independent",
      Q42: "BJP",
      Q43: "Congress",
      Q44: "SP",
      Q45: "DMK",
      Q46: "SP",
    },
    surveySchema,
  );

  assert.deepEqual(nested, {
    Q30: ["Exercise/Gym", "Sports", "Yoga", "Others - Kickboxing"],
    Q37: ["BJP", "Congress", "Others - Independent"],
    Q42: ["BJP", "Congress", "SP", "DMK"],
    Q46: "SP",
  });
});

test("nestAnswersByQuestion consolidates matrix row keys under parent", () => {
  const schema: FormExportSchema = {
    version: 1,
    fields: [
      {
        id: "importance",
        qKey: "Q22",
        label: "Rate the following",
        type: "matrix",
        rows: [
          { label: "Inflation", fieldName: "rate_inflation", qKey: "Q22" },
          { label: "Jobs", fieldName: "rate_jobs", qKey: "Q23" },
        ],
      },
    ],
  };

  const nested = nestAnswersByQuestion(
    {
      Q22: "Very Important",
      Q23: "Important",
    },
    schema,
  );

  assert.deepEqual(nested.Q22, {
    Q22: "Very Important",
    Q23: "Important",
  });
  assert.equal(nested.Q23, undefined);
});

test("nestAnswersByQuestion preserves object values under multiple_select", () => {
  const nested = nestAnswersByQuestion(
    {
      Q30: { International: "Yes", Domestic: "No" },
    },
    surveySchema,
  );

  assert.deepEqual(nested.Q30, { International: "Yes", Domestic: "No" });
});
