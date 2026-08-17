import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isAnyDuplicate,
  matchesDuplicateFilter,
  matchesPayoutDuplicateFilter,
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

test("flagged + clean partition the full set", () => {
  const rows = [
    { isFlaggedDuplicate: false, duplicateFlag: false },
    { isFlaggedDuplicate: true, duplicateFlag: false },
    { isFlaggedDuplicate: false, duplicateFlag: true },
    { isFlaggedDuplicate: true, duplicateFlag: true },
    { isFlaggedDuplicate: Boolean(null), duplicateFlag: Boolean(null) },
  ];
  const flagged = rows.filter((row) =>
    matchesPayoutDuplicateFilter(row, "flagged"),
  );
  const clean = rows.filter((row) =>
    matchesPayoutDuplicateFilter(row, "clean"),
  );
  assert.equal(flagged.length + clean.length, rows.length);
  assert.equal(flagged.length, 3);
  assert.equal(clean.length, 2);
});

test("respondent filter labels are unchanged", () => {
  const row = { isFlaggedDuplicate: true, duplicateFlag: false };
  assert.equal(matchesDuplicateFilter(row, "duplicates"), true);
  assert.equal(matchesDuplicateFilter(row, "non_duplicates"), false);
});
