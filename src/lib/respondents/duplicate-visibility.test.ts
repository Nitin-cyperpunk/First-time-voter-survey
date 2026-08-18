import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isAnyDuplicate,
  isCleanForPayout,
  isDeliverableClean,
  isIpReviewOnly,
  matchesDuplicateFilter,
  matchesPayoutDuplicateFilter,
  surveyEarningsAmount,
} from "@/lib/respondents/duplicate-visibility";

test("NULL duplicate signals count as Clean, not Flagged", () => {
  const nullRow = {
    isFlaggedDuplicate: Boolean(null),
    duplicateFlag: Boolean(null),
    originalParticipantLeadId: null,
  };
  const undefinedRow = {
    isFlaggedDuplicate: false,
    duplicateFlag: false,
  };

  assert.equal(isAnyDuplicate(nullRow), false);
  assert.equal(matchesPayoutDuplicateFilter(nullRow, "clean"), true);
  assert.equal(matchesPayoutDuplicateFilter(nullRow, "flagged"), false);
  assert.equal(matchesPayoutDuplicateFilter(undefinedRow, "clean"), true);
  assert.equal(matchesPayoutDuplicateFilter(undefinedRow, "all"), true);
});

test("IP-only rows are flagged for review and still clean for payout", () => {
  const ipOnly = { isFlaggedDuplicate: true, duplicateFlag: false };
  assert.equal(matchesPayoutDuplicateFilter(ipOnly, "flagged"), true);
  assert.equal(matchesPayoutDuplicateFilter(ipOnly, "clean"), true);
  assert.equal(matchesPayoutDuplicateFilter(ipOnly, "ip_review"), true);
});

test("Clean excludes fingerprint only; IP-only stays clean", () => {
  const ipOnly = { isFlaggedDuplicate: true, duplicateFlag: false };
  const fingerprint = { isFlaggedDuplicate: false, duplicateFlag: true };

  assert.equal(isCleanForPayout(ipOnly), true);
  assert.equal(isCleanForPayout(fingerprint), false);
  assert.equal(isIpReviewOnly(ipOnly), true);
  assert.equal(matchesDuplicateFilter(ipOnly, "non_duplicates"), true);
  assert.equal(matchesDuplicateFilter(ipOnly, "ip_review"), true);
  assert.equal(matchesDuplicateFilter(fingerprint, "non_duplicates"), false);
  assert.equal(matchesDuplicateFilter(fingerprint, "fingerprint"), true);

  const hollowComplete = {
    status: "completed",
    isFlaggedDuplicate: false,
    duplicateFlag: false,
    surveyDataIncomplete: true,
  };
  const ipComplete = {
    status: "completed",
    isFlaggedDuplicate: true,
    duplicateFlag: false,
  };
  assert.equal(matchesDuplicateFilter(hollowComplete, "non_duplicates"), false);
  assert.equal(matchesDuplicateFilter(ipComplete, "non_duplicates"), true);
});

test("payout ip_review filter shows IP-only rows", () => {
  const ipOnly = { isFlaggedDuplicate: true, duplicateFlag: false };
  const both = { isFlaggedDuplicate: true, duplicateFlag: true };

  assert.equal(matchesPayoutDuplicateFilter(ipOnly, "ip_review"), true);
  assert.equal(matchesPayoutDuplicateFilter(both, "ip_review"), false);
});

test("deliverable clean excludes fingerprint and QC fail; IP-only stays", () => {
  const ipComplete = {
    status: "completed",
    isFlaggedDuplicate: true,
    duplicateFlag: false,
  };
  const fpComplete = {
    status: "completed",
    isFlaggedDuplicate: false,
    duplicateFlag: true,
  };
  const qcFail = {
    status: "unsuccessful",
    isFlaggedDuplicate: false,
    duplicateFlag: false,
  };
  const adminPass = {
    status: "successful",
    isFlaggedDuplicate: false,
    duplicateFlag: false,
  };
  const terminated = {
    status: "terminated",
    isFlaggedDuplicate: false,
    duplicateFlag: false,
  };
  const hollow = {
    status: "completed",
    isFlaggedDuplicate: false,
    duplicateFlag: false,
    surveyDataIncomplete: true,
  };

  assert.equal(isDeliverableClean(ipComplete), true);
  assert.equal(isDeliverableClean(fpComplete), false);
  assert.equal(isDeliverableClean(qcFail), false);
  assert.equal(isDeliverableClean(adminPass), true);
  assert.equal(isDeliverableClean(terminated), false);
  assert.equal(isDeliverableClean(hollow), false);
});

test("survey earnings match deliverable clean eligibility", () => {
  const rate = 75;
  const cleanComplete = {
    status: "completed",
    isFlaggedDuplicate: false,
    duplicateFlag: false,
  };
  const fpComplete = {
    status: "completed",
    isFlaggedDuplicate: false,
    duplicateFlag: true,
  };

  assert.equal(surveyEarningsAmount(cleanComplete, rate), 75);
  assert.equal(surveyEarningsAmount(fpComplete, rate), 0);
});
