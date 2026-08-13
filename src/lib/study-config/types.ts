/**
 * Stable study config contract (Part 1 Settings + Part 2 metrics).
 * Stored as form_settings.study_config jsonb on form_type=registration.
 */
export type StudyConfig = {
  target: number;
  buffer: number;
  survey_active: boolean;
  eligibility_open: boolean;
  screener_open: boolean;
  project_open: boolean;
  age_min: number;
  age_max: number;
  age_rule_on: boolean;
  term_consent_no: boolean;
  term_gender_male: boolean;
  term_decider_other: boolean;
  term_occupation_sensitive: boolean;
  term_last_buy_12mo: boolean;
  /** Survey incentive (₹). Paid after QC pass — existing flow unchanged. */
  survey_reward_amount: number;
  /** Referral incentive per qualified friend (₹). Default 0. */
  referral_reward_amount: number;
};

export type StudyConfigPatch = Partial<StudyConfig>;
