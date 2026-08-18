import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_STUDY_CONFIG } from "@/lib/study-config/defaults";
import {
  coerceAgeBand,
  isAgeBandWithinStudyRule,
  isCapacityEnforced,
  isRegistrationAccepting,
  maySubmitWhileFormClosed,
  parseAgeBand,
} from "@/lib/study-config/gates";
import { parseStudyConfig } from "@/lib/study-config/parse";

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

test("enforce_capacity is opt-in; new cities default to 12 from config", () => {
  assert.equal(DEFAULT_STUDY_CONFIG.enforce_capacity, false);
  assert.equal(DEFAULT_STUDY_CONFIG.enforce_quota_cascade, false);
  assert.equal(DEFAULT_STUDY_CONFIG.default_city_capacity, 12);
  assert.equal(DEFAULT_STUDY_CONFIG.auto_close_on_full, false);
  assert.equal(isCapacityEnforced(DEFAULT_STUDY_CONFIG), false);
  assert.equal(parseStudyConfig({}).enforce_capacity, false);
  assert.equal(parseStudyConfig({}).default_city_capacity, 12);
  assert.equal(parseStudyConfig({ enforce_capacity: true }).enforce_capacity, true);
  assert.equal(
    isCapacityEnforced(parseStudyConfig({ enforce_capacity: true })),
    true,
  );
});

test("maySubmitWhileFormClosed allows mid-survey finish only when startedAt is set", () => {
  assert.equal(maySubmitWhileFormClosed(null), false);
  assert.equal(maySubmitWhileFormClosed(undefined), false);
  assert.equal(maySubmitWhileFormClosed(""), false);
  assert.equal(maySubmitWhileFormClosed("2026-08-14T10:00:00.000Z"), true);
  assert.equal(maySubmitWhileFormClosed(new Date("2026-08-14T10:00:00.000Z")), true);
});

test("form accepts new responses until clean reaches target", () => {
  const open = { ...DEFAULT_STUDY_CONFIG, form_status: "open" as const, target: 200 };
  const closed = { ...open, form_status: "closed" as const };
  assert.equal(isRegistrationAccepting(open, 133), true);
  assert.equal(isRegistrationAccepting(open, 199), true);
  assert.equal(isRegistrationAccepting(open, 200), false);
  assert.equal(isRegistrationAccepting(open, 201), false);
  assert.equal(isRegistrationAccepting(closed, 100), false);
});
