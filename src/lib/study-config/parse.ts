import { DEFAULT_STUDY_CONFIG } from "@/lib/study-config/defaults";
import type { StudyConfig } from "@/lib/study-config/types";

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asInt(value: unknown, fallback: number, min = 0, max = 10_000): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function parseStudyConfig(raw: unknown): StudyConfig {
  const base = { ...DEFAULT_STUDY_CONFIG };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }

  const record = raw as Record<string, unknown>;
  const target = asInt(record.target, base.target, 1, 10_000);
  const buffer = asInt(record.buffer, base.buffer, 0, 10_000);
  let ageMin = asInt(record.age_min, base.age_min, 1, 120);
  let ageMax = asInt(record.age_max, base.age_max, 1, 120);
  if (ageMin > ageMax) {
    [ageMin, ageMax] = [ageMax, ageMin];
  }

  const formStatusRaw = record.form_status;
  const form_status =
    formStatusRaw === "closed" || formStatusRaw === "open"
      ? formStatusRaw
      : base.form_status;

  return {
    target,
    buffer,
    total_capacity: asInt(record.total_capacity, base.total_capacity, 1, 10_000),
    form_status,
    auto_close_on_full: asBool(record.auto_close_on_full, base.auto_close_on_full),
    survey_active: asBool(record.survey_active, base.survey_active),
    eligibility_open: asBool(record.eligibility_open, base.eligibility_open),
    screener_open: asBool(record.screener_open, base.screener_open),
    project_open: asBool(record.project_open, base.project_open),
    age_min: ageMin,
    age_max: ageMax,
    age_rule_on: asBool(record.age_rule_on, base.age_rule_on),
    term_consent_no: asBool(record.term_consent_no, base.term_consent_no),
    term_gender_male: asBool(record.term_gender_male, base.term_gender_male),
    term_decider_other: asBool(
      record.term_decider_other,
      base.term_decider_other,
    ),
    term_occupation_sensitive: asBool(
      record.term_occupation_sensitive,
      base.term_occupation_sensitive,
    ),
    term_last_buy_12mo: asBool(
      record.term_last_buy_12mo,
      base.term_last_buy_12mo,
    ),
    survey_reward_amount: asInt(
      record.survey_reward_amount,
      base.survey_reward_amount,
      0,
      1_000_000,
    ),
    referral_reward_amount: asInt(
      record.referral_reward_amount,
      base.referral_reward_amount,
      0,
      1_000_000,
    ),
  };
}

export function mergeStudyConfig(stored: unknown): StudyConfig {
  return parseStudyConfig(stored);
}
