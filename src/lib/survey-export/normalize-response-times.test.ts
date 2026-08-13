import assert from "node:assert/strict";
import test from "node:test";
import type { FormExportSchema } from "@/lib/form-export/types";
import { normalizeSurveyResponseTimes } from "@/lib/survey-export/normalize-response-times";

const schema: FormExportSchema = {
  version: 1,
  fields: [
    {
      id: "q1",
      qKey: "Q1",
      label: "Brand ratings",
      type: "matrix",
      fieldName: "q1_brands",
      rows: [
        { label: "Brand 1", fieldName: "q1_brand_1", qKey: "Q2" },
        { label: "Brand 2", fieldName: "q1_brand_2", qKey: "Q3" },
      ],
    },
    {
      id: "q4",
      qKey: "Q4",
      label: "Favorite",
      type: "single_select",
      fieldName: "favorite",
    },
  ],
};

test("maps field-name timing keys onto parent answer Q-keys", () => {
  const times = normalizeSurveyResponseTimes(
    { q1_brand_1: 4.2, q1_brand_2: 1.8, favorite: 3 },
    ["Q1", "Q4"],
    schema,
  );

  assert.deepEqual(times, { Q1: 6, Q4: 3 });
});

test("fills missing answer keys with zero", () => {
  const times = normalizeSurveyResponseTimes(
    { q1_brand_1: 2 },
    ["Q1", "Q4"],
    schema,
  );

  assert.deepEqual(times, { Q1: 2, Q4: 0 });
});

test("drops unmappable keys instead of failing", () => {
  const times = normalizeSurveyResponseTimes(
    { totally_unknown_field: 9, Q4: 1 },
    ["Q4"],
    schema,
  );

  assert.deepEqual(times, { Q4: 1 });
});
