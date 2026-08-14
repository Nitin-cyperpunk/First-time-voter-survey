import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_STUDY_CONFIG } from "@/lib/study-config/defaults";
import {
  coerceAgeBand,
  isAgeBandWithinStudyRule,
  parseAgeBand,
} from "@/lib/study-config/gates";

test("coerceAgeBand preserves decimal ages from DOB-derived values", () => {
  assert.equal(coerceAgeBand("24.63"), "24.63");
  assert.equal(coerceAgeBand(22.4), "22.4");
  assert.equal(coerceAgeBand("18"), "18");
  assert.equal(coerceAgeBand("23+"), "23+");
  const fromDob = coerceAgeBand("", "2002-06-15");
  assert.ok(fromDob);
  assert.ok(Number(fromDob) >= 23);
});

test("parseAgeBand reads decimals, whole years, and 23+", () => {
  assert.deepEqual(parseAgeBand("24.3"), { min: 24.3, max: 24.3 });
  assert.deepEqual(parseAgeBand("18"), { min: 18, max: 18 });
  assert.deepEqual(parseAgeBand("23+"), {
    min: 23,
    max: Number.POSITIVE_INFINITY,
  });
  assert.equal(parseAgeBand("nope"), null);
});

test("isAgeBandWithinStudyRule overlaps [age_min, age_max]", () => {
  const on = {
    ...DEFAULT_STUDY_CONFIG,
    age_rule_on: true,
    age_min: 18,
    age_max: 30,
  };
  assert.equal(isAgeBandWithinStudyRule("18", on), true);
  assert.equal(isAgeBandWithinStudyRule("24.3", on), true);
  assert.equal(isAgeBandWithinStudyRule("22", on), true);
  assert.equal(isAgeBandWithinStudyRule("23+", on), true);
  assert.equal(isAgeBandWithinStudyRule("17.5", on), false);

  const tight = { ...on, age_max: 22 };
  assert.equal(isAgeBandWithinStudyRule("23+", tight), false);
  assert.equal(isAgeBandWithinStudyRule("24.3", tight), false);
  assert.equal(isAgeBandWithinStudyRule("22", tight), true);

  const off = { ...DEFAULT_STUDY_CONFIG, age_rule_on: false };
  assert.equal(isAgeBandWithinStudyRule("17", off), true);
});
