import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractStoredFtvPayload,
  isMissingInsertFtvRpc,
  isMissingReferralCodeColumn,
} from "@/server/repositories/ftv-responses.repository";

test("detects PostgREST missing insert_ftv_response signature", () => {
  assert.equal(
    isMissingInsertFtvRpc({
      code: "PGRST202",
      message:
        "Could not find the function public.insert_ftv_response(p_city_id, p_referral_code, p_respondent_id) in the schema cache",
    }),
    true,
  );
  assert.equal(isMissingInsertFtvRpc({ message: "duplicate key" }), false);
});

test("detects missing referral_code column", () => {
  assert.equal(
    isMissingReferralCodeColumn({
      code: "PGRST204",
      message: "Could not find the 'referral_code' column of 'ftv_responses' in the schema cache",
    }),
    true,
  );
});

test("extracts FTV payload from analytics.__ftv_payload", () => {
  const payload = extractStoredFtvPayload({
    __ftv_payload: { status: "COMPLETE", responses: [{ qid: "Q1" }] },
  });
  assert.equal(payload?.status, "COMPLETE");
  assert.equal(Array.isArray(payload?.responses), true);
});

test("extracts FTV payload when answers is already the payload", () => {
  const payload = extractStoredFtvPayload({
    survey_version: "FTV-v1c",
    responses: [{ qid: "QA" }, { qid: "Q1" }],
  });
  assert.equal(payload?.survey_version, "FTV-v1c");
});

test("returns null when no FTV responses array is present", () => {
  assert.equal(extractStoredFtvPayload({ Q1: "Yes", city_id: "x" }), null);
});
