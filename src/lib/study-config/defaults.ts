import type { StudyConfig } from "@/lib/study-config/types";

/**
 * Defaults: all gates open. Age rule off until admin enables it.
 * target=150, buffer=30 → closesAt = target + buffer (180).
 * total_capacity (200) is a reference N, not a hard cap.
 * Per-city enforcement is on in live study_config (migration 021).
 * Code default stays false so a missing key cannot close cities at capacity 0.
 */
export const DEFAULT_STUDY_CONFIG: StudyConfig = {
  target: 150,
  buffer: 30,
  total_capacity: 200,
  enforce_capacity: false,
  enforce_quota_cascade: false,
  default_city_capacity: 12,
  form_status: "open",
  auto_close_on_full: false,
  survey_active: true,
  eligibility_open: true,
  screener_open: true,
  project_open: true,
  age_min: 18,
  age_max: 30,
  age_rule_on: false,
  term_consent_no: true,
  term_q1_not_first_time: true,
  term_q2_did_not_vote: true,
  survey_reward_amount: 50,
  referral_reward_amount: 0,
  urban_non_urban_pct: 50,
  quota_reallocation_min_fill_pct: 25,
  quota_reallocation_after_days: 14,
  quota_reallocation_max_transfer_pct: 50,
};

/** Registration capacity used as Registered /N denominator. */
export function registrationCap(config: StudyConfig): number {
  return config.target + config.buffer;
}

/** Alias for funnelSnapshot-style closesAt. */
export function closesAt(config: StudyConfig): number {
  return registrationCap(config);
}
