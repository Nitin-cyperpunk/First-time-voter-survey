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
      label: "Bra types purchased",
      type: "multiple_select",
      fieldName: "bq6_types",
      otherOption: "Other",
      otherKey: "Q38",
      otherSpecifyField: "bq6_types_other",
    },
    {
      id: "bq10_brands_used",
      qKey: "Q42",
      label: "Everyday bra brands used",
      type: "open_multi",
      fieldName: "bq10_brand_1",
      boxes: [
        { label: "Brand 1", fieldName: "bq10_brand_1", qKey: "Q42" },
        { label: "Brand 2", fieldName: "bq10_brand_2", qKey: "Q43" },
        { label: "Brand 3", fieldName: "bq10_brand_3", qKey: "Q44" },
        { label: "Brand 4", fieldName: "bq10_brand_4", qKey: "Q45" },
      ],
    },
    {
      id: "bq11_recent_brand",
      qKey: "Q46",
      label: "Most recent brand",
      type: "single_select",
      fieldName: "bq11_recent_brand",
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

test("nestAnswersByQuestion merges bra-type other specify into Q37", () => {
  const nested = nestAnswersByQuestion(
    {
      Q37: ["Everyday bra", "Other"],
      Q38: "Wireless Lounge Bra",
    },
    surveySchema,
  );

  assert.deepEqual(nested.Q37, [
    "Everyday bra",
    "Others - Wireless Lounge Bra",
  ]);
  assert.equal(nested.Q38, undefined);
});

test("nestAnswersByQuestion collapses open-multi textboxes into one array", () => {
  const nested = nestAnswersByQuestion(
    {
      Q42: "Enamor",
      Q43: "Jockey",
      Q44: "Vermon",
      Q45: "Rocky",
    },
    surveySchema,
  );

  assert.deepEqual(nested.Q42, ["Enamor", "Jockey", "Vermon", "Rocky"]);
  assert.equal(nested.Q43, undefined);
  assert.equal(nested.Q44, undefined);
  assert.equal(nested.Q45, undefined);
});

test("nestAnswersByQuestion skips empty open-multi boxes", () => {
  const nested = nestAnswersByQuestion(
    {
      Q42: "Enamor",
      Q43: "Jockey",
      Q44: "Vermon",
      Q45: "",
    },
    surveySchema,
  );

  assert.deepEqual(nested.Q42, ["Enamor", "Jockey", "Vermon"]);
});

test("nestAnswersByQuestion keeps independent single-select questions separate", () => {
  const nested = nestAnswersByQuestion(
    {
      Q42: "Enamor",
      Q43: "Jockey",
      Q46: "Vermon",
    },
    surveySchema,
  );

  assert.equal(nested.Q46, "Vermon");
});

test("nestAnswersByQuestion produces the full expected survey shape", () => {
  const nested = nestAnswersByQuestion(
    {
      Q30: ["Exercise/Gym", "Sports", "Yoga", "Other"],
      Q31: "Kickboxing",
      Q37: ["Everyday bra", "T-shirt bra", "Other"],
      Q38: "Wireless Lounge Bra",
      Q42: "Enamor",
      Q43: "Jockey",
      Q44: "Vermon",
      Q45: "Rocky",
      Q46: "Vermon",
    },
    surveySchema,
  );

  assert.deepEqual(nested, {
    Q30: ["Exercise/Gym", "Sports", "Yoga", "Others - Kickboxing"],
    Q37: ["Everyday bra", "T-shirt bra", "Others - Wireless Lounge Bra"],
    Q42: ["Enamor", "Jockey", "Vermon", "Rocky"],
    Q46: "Vermon",
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
          { label: "Comfort", fieldName: "rate_comfort", qKey: "Q22" },
          { label: "Fit", fieldName: "rate_fit", qKey: "Q23" },
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
    Comfort: "Very Important",
    Fit: "Important",
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
