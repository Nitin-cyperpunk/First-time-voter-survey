import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isFtvShapedQKeyMap,
  padFtvResponsesForContract,
  resolveFtvStatus,
  stampFtvRespondentId,
  wrapQKeyAnswersAsPayload,
} from "@/lib/ftv-payload";

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

test("pads missing Q6b_10 so 43-entry completes pass the FTV contract", () => {
  const padded = padFtvResponsesForContract({
    status: "COMPLETE",
    responses: [
      { qid: "Q6b_1", type: "grid" },
      { qid: "Q6b_9", type: "grid" },
      { qid: "Q7_rank1", type: "rank" },
    ],
  });
  const qids = (padded.responses as Array<{ qid: string }>).map((row) => row.qid);
  assert.deepEqual(qids, ["Q6b_1", "Q6b_9", "Q6b_10", "Q7_rank1"]);
});

test("does not pad Q6b_10 when the row is already present", () => {
  const payload = {
    responses: [
      { qid: "Q6b_1" },
      { qid: "Q6b_10" },
    ],
  };
  assert.equal(padFtvResponsesForContract(payload), payload);
});

test("wraps Q-key screener answers into an FTV responses array", () => {
  const payload = wrapQKeyAnswersAsPayload({ Q1: "Yes", Q2: "Yes", _st: {} });
  assert.equal(payload?.status, "COMPLETE");
  assert.deepEqual(payload?.responses, [
    { qid: "Q1", type: "single", answer: "Yes" },
    { qid: "Q2", type: "single", answer: "Yes" },
  ]);
});

test("treats Q18+ maps as a different instrument", () => {
  assert.equal(isFtvShapedQKeyMap({ Q1: "Yes", Q18: "x" }), false);
  assert.equal(isFtvShapedQKeyMap({ Q1: "Yes", Q2: "Yes" }), true);
  assert.equal(isFtvShapedQKeyMap({ Q6a_1: "4" }), true);
});
