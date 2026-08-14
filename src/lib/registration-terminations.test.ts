import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isRegistrationTerminated,
  resolveRegistrationTerminationState,
} from "@/lib/registration-terminations";

test("resolveRegistrationTerminationState reads answerJson TERMINATE status", () => {
  const state = resolveRegistrationTerminationState({
    answerJson: { status: "TERMINATE_AGE_OUT_OF_RANGE" },
  });

  assert.equal(state.terminated, true);
  assert.equal(state.terminations[0]?.ruleKey, "TERMINATE_AGE_OUT_OF_RANGE");
});

test("isRegistrationTerminated stays true when terminations are already present", () => {
  assert.equal(
    isRegistrationTerminated({
      terminated: true,
      terminations: [{ ruleKey: "TERMINATE_NOT_FIRST_TIME" }],
    }),
    true,
  );
});
