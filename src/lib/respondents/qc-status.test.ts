import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeAutoQcStatus,
  computeEffectiveQcStatus,
  surveyPayoutAmount,
  validateQcOverrideReason,
} from "@/lib/respondents/qc-status";

test("auto QC: clean complete → pass", () => {
  assert.equal(
    computeAutoQcStatus({
      status: "completed",
      duplicateFlag: false,
      isFlaggedDuplicate: false,
    }),
    "pass",
  );
});

test("auto QC: fingerprint cluster member → fail (including original)", () => {
  assert.equal(
    computeAutoQcStatus({
      status: "terminated",
      duplicateFlag: true,
      isFlaggedDuplicate: false,
      isFingerprintClusterOriginal: true,
    }),
    "fail",
  );
});

test("auto QC: terminated without fingerprint → review", () => {
  assert.equal(
    computeAutoQcStatus({
      status: "terminated",
      duplicateFlag: false,
      isFlaggedDuplicate: false,
    }),
    "review",
  );
});

test("auto QC: IP-only → review not fail", () => {
  assert.equal(
    computeAutoQcStatus({
      status: "completed",
      duplicateFlag: false,
      isFlaggedDuplicate: true,
    }),
    "review",
  );
});

test("effective QC uses override when set", () => {
  const row = {
    status: "completed",
    duplicateFlag: true,
    isFlaggedDuplicate: false,
    qcStatusOverride: "pass" as const,
  };
  assert.equal(computeAutoQcStatus(row), "fail");
  assert.equal(computeEffectiveQcStatus(row), "pass");
});

test("survey payout amount uses effective pass", () => {
  const rate = 75;
  const row = { status: "completed", duplicateFlag: false, isFlaggedDuplicate: false };
  assert.equal(surveyPayoutAmount(row, "pass", rate), 75);
  assert.equal(surveyPayoutAmount(row, "review", rate), 0);
});

test("override reason minimum length", () => {
  assert.equal(validateQcOverrideReason("ok"), false);
  assert.equal(validateQcOverrideReason("Approved after phone verification."), true);
});
