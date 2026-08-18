import type { StudyConfig } from "@/lib/study-config/types";

/** True when deliverable clean has reached the study target (default 200). */
export function isCleanTargetReached(
  cleanCount: number,
  target: number,
): boolean {
  return cleanCount >= target;
}

/**
 * Public form may accept new responses.
 * Closed when an admin sets form_status, or when clean deliverable >= target.
 * The raw completed line (target + buffer, e.g. 230) does not close the form.
 */
export function isRegistrationAccepting(
  config: StudyConfig,
  cleanCount?: number,
): boolean {
  if (config.form_status !== "open") return false;
  if (
    cleanCount != null &&
    isCleanTargetReached(cleanCount, config.target)
  ) {
    return false;
  }
  return true;
}

/**
 * Per-city qualified-complete limit when study_config.enforce_capacity is true.
 * Counting always runs. Cell/state/study rejects stay in the RPC behind
 * enforce_quota_cascade (default false).
 */
export function isCapacityEnforced(config: StudyConfig): boolean {
  return config.enforce_capacity === true;
}

/**
 * Mid-survey respondents (form already mounted, startedAt set) may finish after
 * a manual close so partial data is not discarded. Fresh POSTs without startedAt
 * are rejected with form_closed.
 */
export function isFormClosedForNewRespondents(
  config: StudyConfig,
  cleanCount?: number,
): boolean {
  return !isRegistrationAccepting(config, cleanCount);
}

export function maySubmitWhileFormClosed(startedAt?: string | Date | null): boolean {
  if (startedAt == null) return false;
  if (startedAt instanceof Date) return !Number.isNaN(startedAt.getTime());
  return String(startedAt).trim().length > 0;
}

export function getAgeYears(
  dob: string,
  referenceDate: Date = new Date(),
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) return null;
  const [year, month, day] = dob.split("-").map(Number);
  const birthDate = new Date(year, month - 1, day);
  if (Number.isNaN(birthDate.getTime())) return null;

  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }
  return age;
}

/** When age_rule_on, DOB must fall within [age_min, age_max]. */
export function isAgeWithinStudyRule(
  dob: string,
  config: StudyConfig,
  referenceDate: Date = new Date(),
): boolean {
  if (!config.age_rule_on) return true;
  const age = getAgeYears(dob, referenceDate);
  if (age === null) return false;
  return age >= config.age_min && age <= config.age_max;
}

export const AGE_BAND_VALUES = ["18", "19", "20", "21", "22", "23+"] as const;
export type AgeBandValue = (typeof AGE_BAND_VALUES)[number];

/** Round to 2 decimal places, matching the FTV form `yrs()` helper. */
export function formatAgeYears(years: number): string {
  if (!Number.isFinite(years) || years < 1) return "";
  return String(Math.round(years * 100) / 100);
}

/** Decimal age from DOB using the same average-year length as the live form. */
export function getAgeYearsDecimal(
  dob: string,
  referenceDate: Date = new Date(),
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) return null;
  const [year, month, day] = dob.split("-").map(Number);
  const birthDate = new Date(year, month - 1, day);
  if (Number.isNaN(birthDate.getTime())) return null;
  const msPerYear = 31557600000;
  const age = (referenceDate.getTime() - birthDate.getTime()) / msPerYear;
  if (!Number.isFinite(age) || age < 0) return null;
  return Math.round(age * 100) / 100;
}

/** Map a whole-year age to legacy discrete FTV bands (kept for old payloads). */
export function ageBandFromYears(years: number): AgeBandValue | "" {
  const age = Math.floor(years);
  if (!Number.isFinite(age) || age < 1) return "";
  if (age <= 18) return "18";
  if (age === 19) return "19";
  if (age === 20) return "20";
  if (age === 21) return "21";
  if (age === 22) return "22";
  return "23+";
}

export function coerceAgeBand(
  raw: unknown,
  dob?: string | null,
): string {
  if (typeof raw === "number") {
    return formatAgeYears(raw);
  }
  const text = String(raw ?? "").trim();
  if (!text) {
    if (dob) {
      const decimal = getAgeYearsDecimal(dob);
      if (decimal != null) return formatAgeYears(decimal);
    }
    return "";
  }
  if (/^23\+$/i.test(text)) return "23+";
  if ((AGE_BAND_VALUES as readonly string[]).includes(text)) {
    return text;
  }
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 120) {
    return formatAgeYears(numeric);
  }
  if (dob) {
    const decimal = getAgeYearsDecimal(dob);
    if (decimal != null) return formatAgeYears(decimal);
  }
  return "";
}

/** Decimal ages (e.g. 24.3), whole years, or legacy 23+ band. */
export function parseAgeBand(
  band: string,
): { min: number; max: number } | null {
  const value = band.trim();
  if (/^23\+$/i.test(value) || /^23\s*or\s*older$/i.test(value)) {
    return { min: 23, max: Number.POSITIVE_INFINITY };
  }
  const age = Number(value);
  if (!Number.isFinite(age) || age < 1 || age > 120) return null;
  return { min: age, max: age };
}

/**
 * When age_rule_on, the selected age_band must overlap [age_min, age_max].
 * `23+` overlaps any window whose max is ≥ 23 (cannot distinguish 23 vs 40).
 */
export function isAgeBandWithinStudyRule(
  band: string,
  config: StudyConfig,
): boolean {
  if (!config.age_rule_on) return true;
  const parsed = parseAgeBand(band);
  if (!parsed) return false;
  return parsed.min <= config.age_max && parsed.max >= config.age_min;
}

export function ageOutOfRangeMessage(config: StudyConfig): string {
  return `You must be between ${config.age_min} and ${config.age_max} years old to participate.`;
}
