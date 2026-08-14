import assert from "node:assert/strict";
import { test } from "node:test";

import { launchRegistrationSchema } from "@/features/launch/schemas/registration";

test("launchRegistrationSchema requires city and age for qualified completions", () => {
  const result = launchRegistrationSchema.safeParse({
    city: "Mumbai",
    age_band: "24.3",
    answers: { Q1: "No" },
  });

  assert.equal(result.success, true);
});

test("launchRegistrationSchema accepts terminated submissions without city or age", () => {
  const result = launchRegistrationSchema.safeParse({
    terminated: true,
    terminations: [{ ruleKey: "Q1_not_first_time" }],
    answers: { Q1: "No" },
    answerJson: {
      status: "TERMINATE_Q1",
      profile: {},
      responses: [],
    },
  });

  assert.equal(result.success, true);
});

test("launchRegistrationSchema rejects qualified submissions missing city", () => {
  const result = launchRegistrationSchema.safeParse({
    age_band: "24.3",
    answers: { Q1: "Yes" },
  });

  assert.equal(result.success, false);
});
