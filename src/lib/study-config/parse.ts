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
    enforce_capacity: asBool(record.enforce_capacity, base.enforce_capacity),
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
    term_q1_not_first_time: asBool(
      record.term_q1_not_first_time,
      base.term_q1_not_first_time,
    ),
    term_q2_did_not_vote: asBool(
      record.term_q2_did_not_vote,
      base.term_q2_did_not_vote,
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
    urban_non_urban_pct: asInt(
      record.urban_non_urban_pct,
      base.urban_non_urban_pct,
      0,
      100,
    ),
    quota_reallocation_min_fill_pct: asInt(
      record.quota_reallocation_min_fill_pct,
      base.quota_reallocation_min_fill_pct,
      0,
      100,
    ),
    quota_reallocation_after_days: asInt(
      record.quota_reallocation_after_days,
      base.quota_reallocation_after_days,
      0,
      3650,
    ),
    quota_reallocation_max_transfer_pct: asInt(
      record.quota_reallocation_max_transfer_pct,
      base.quota_reallocation_max_transfer_pct,
      0,
      100,
    ),
  };
}

export function mergeStudyConfig(stored: unknown): StudyConfig {
  return parseStudyConfig(stored);
}
