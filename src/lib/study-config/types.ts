/**
 * Stable study config contract (Part 1 Settings + Part 2 metrics).
 * Stored as form_settings.study_config jsonb on form_type=registration.
 */
export type FormStatus = "open" | "closed";

export type StudyConfig = {
  target: number;
  buffer: number;
  /** Reference N for counting/reporting. Not a hard cap. Fieldwork closes via form_status. */
  total_capacity: number;
  /**
   * Per-city qualified-complete limit (cities.capacity). Unmatched (no city_id)
   * bypass it. Does not enforce cell / state / study caps unless
   * enforce_quota_cascade is also true (kept in the RPC, default false).
   */
  enforce_capacity: boolean;
  /**
   * When true with enforce_capacity, restore city → cell → state → study rejects.
   * Default false: city-level only. Not a UI control — config/SQL only.
   */
  enforce_quota_cascade: boolean;
  /** Capacity stored on newly added cities. Override per city without a code change. */
  default_city_capacity: number;
  /** Respondent-facing form open/close. Independent of target/buffer funnel. */
  form_status: FormStatus;
  /** Do not enable for this study. Form is closed manually via form_status. */
  auto_close_on_full: boolean;
  survey_active: boolean;
  eligibility_open: boolean;
  screener_open: boolean;
  project_open: boolean;
  age_min: number;
  age_max: number;
  age_rule_on: boolean;
  term_consent_no: boolean;
  term_q1_not_first_time: boolean;
  term_q2_did_not_vote: boolean;
  /** Survey incentive (₹). Paid after QC pass — existing flow unchanged. */
  survey_reward_amount: number;
  /** Referral incentive per qualified friend (₹). Default 0. */
  referral_reward_amount: number;
  /** Global urban share of each state allocation. Default 50 (50:50 with rural). */
  urban_non_urban_pct: number;
  /** Soft reallocation: donor cell fill % must be at or below this. */
  quota_reallocation_min_fill_pct: number;
  /** Soft reallocation: days since last completion in the donor cell. */
  quota_reallocation_after_days: number;
  /** Soft reallocation: max transfer as % of donor remaining. */
  quota_reallocation_max_transfer_pct: number;
};

export type StudyConfigPatch = Partial<StudyConfig>;
