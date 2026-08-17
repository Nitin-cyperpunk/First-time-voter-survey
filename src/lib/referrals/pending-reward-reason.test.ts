import assert from "node:assert/strict";
import { test } from "node:test";

import { pendingRewardReason } from "@/lib/referrals/pending-reward-reason";

test("earned rows have no pending reason", () => {
  assert.equal(
    pendingRewardReason({
      rewardStatus: "earned",
      referredFound: true,
      referredStatus: "completed",
      terminationReason: null,
    }),
    null,
  );
});

test("terminated referred participant yields a specific reason", () => {
  const reason = pendingRewardReason({
    rewardStatus: "pending",
    referredFound: true,
    referredStatus: "terminated",
    terminationReason: "TERMINATE_AGE_OUT_OF_RANGE",
  });
  assert.equal(
    reason,
    "Referred participant was terminated (age out of range). Reward is earned only if they complete registration.",
  );
});

test("did-not-vote termination is humanized from the stored rule key", () => {
  const reason = pendingRewardReason({
    rewardStatus: "pending",
    referredFound: true,
    referredStatus: "terminated",
    terminationReason: "TERMINATE_DID_NOT_VOTE",
  });
  assert.match(reason ?? "", /did not vote/);
});

test("missing referred participant is honest, not guessed", () => {
  assert.equal(
    pendingRewardReason({
      rewardStatus: "pending",
      referredFound: false,
      referredStatus: null,
      terminationReason: null,
    }),
    "Reason not recorded — referred participant is missing.",
  );
});

test("pending with a completed referred status is not invented as QC wait", () => {
  assert.equal(
    pendingRewardReason({
      rewardStatus: "pending",
      referredFound: true,
      referredStatus: "completed",
      terminationReason: null,
    }),
    "Reason not recorded.",
  );
});
