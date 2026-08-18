import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REFERRAL_EXPORT_HEADERS,
  rowsToReferralExport,
} from "@/lib/referrals/referral-export";

test("export headers are the eight referral columns", () => {
  assert.deepEqual([...REFERRAL_EXPORT_HEADERS], [
    "Referrer name",
    "Referrer mobile",
    "Referred name",
    "Referred mobile",
    "Reward status",
    "Pending reason",
    "Amount",
    "Created date (IST)",
  ]);
});

test("null names, mobiles, amounts, and reasons become empty cells", () => {
  const [row] = rowsToReferralExport([
    {
      referrerName: "",
      referrerMobile: "",
      referredName: "—",
      referredMobile: "None",
      rewardStatus: "pending",
      pendingReason: null,
      rewardAmount: null,
      createdAt: "2026-08-14T12:59:41.000Z",
    },
  ]);

  assert.equal(row["Referrer name"], "");
  assert.equal(row["Referrer mobile"], "");
  assert.equal(row["Referred name"], "");
  assert.equal(row["Referred mobile"], "");
  assert.equal(row["Pending reason"], "");
  assert.equal(row.Amount, "");
  assert.equal(row["Reward status"], "pending");
});

test("earned rows leave pending reason blank even if a reason string is present", () => {
  const [row] = rowsToReferralExport([
    {
      referrerName: "Asha",
      referrerMobile: "9999999999",
      referredName: "Ravi",
      referredMobile: "8888888888",
      rewardStatus: "earned",
      pendingReason: "should not appear",
      rewardAmount: 25,
      createdAt: "2026-08-17T00:00:00.000Z",
    },
  ]);

  assert.equal(row["Pending reason"], "");
  assert.equal(row.Amount, 25);
  assert.equal(row["Created date (IST)"], "2026-08-17 05:30:00");
});
