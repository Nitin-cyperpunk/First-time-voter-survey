import type { StudyConfig } from "@/lib/study-config/types";

/**
 * Defaults: all gates open. Age rule off until admin enables 18–35.
 * target=150, buffer=30 → closesAt = target + buffer (180).
 * Part 2 metrics must read these live — never hardcode 150/180.
 */
export const DEFAULT_STUDY_CONFIG: StudyConfig = {
  target: 150,
  buffer: 30,
  survey_active: true,
  eligibility_open: true,
  screener_open: true,
  project_open: true,
  age_min: 18,
  age_max: 35,
  age_rule_on: false,
  term_consent_no: true,
  term_gender_male: true,
  term_decider_other: true,
  term_occupation_sensitive: true,
  term_last_buy_12mo: true,
  survey_reward_amount: 50,
  referral_reward_amount: 0,
};

/** Registration capacity used as Registered /N denominator. */
export function registrationCap(config: StudyConfig): number {
  return config.target + config.buffer;
}

/** Alias for funnelSnapshot-style closesAt. */
export function closesAt(config: StudyConfig): number {
  return registrationCap(config);
}
