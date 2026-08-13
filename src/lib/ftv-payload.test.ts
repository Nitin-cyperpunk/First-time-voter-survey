import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveFtvStatus, stampFtvRespondentId } from "@/lib/ftv-payload";

test("uses COMPLETE when payload and terminations are empty", () => {
  assert.equal(resolveFtvStatus({}), "COMPLETE");
});

test("prefers payload FTV status", () => {
  assert.equal(
    resolveFtvStatus({
      payloadStatus: "TERMINATE_DID_NOT_VOTE",
      terminated: true,
      terminations: [{ ruleKey: "TERMINATE_NOT_FIRST_TIME" }],
    }),
    "TERMINATE_DID_NOT_VOTE",
  );
});

test("maps termination ruleKey when payload status is missing", () => {
  assert.equal(
    resolveFtvStatus({
      terminated: true,
      terminations: [{ ruleKey: "TERMINATE_AGE_OUT_OF_RANGE" }],
    }),
    "TERMINATE_AGE_OUT_OF_RANGE",
  );
});

test("returns null for unknown terminate so CHECK is not violated", () => {
  assert.equal(
    resolveFtvStatus({
      terminated: true,
      terminations: [{ ruleKey: "consent" }],
    }),
    null,
  );
});

test("stamps CI_FTV lead_id as respondent_id", () => {
  assert.deepEqual(
    stampFtvRespondentId({ respondent_id: null, status: "COMPLETE" }, "CI_FTV_0001"),
    { respondent_id: "CI_FTV_0001", status: "COMPLETE" },
  );
});
