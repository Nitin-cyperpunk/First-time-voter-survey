import type { StudyConfig } from "@/lib/study-config/types";

/** Public form may accept new responses. Only form_status gates the route. */
export function isRegistrationAccepting(config: StudyConfig): boolean {
  return config.form_status === "open";
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

/** Discrete years 18–22, or 23+ (open-ended). */
export function parseAgeBand(
  band: string,
): { min: number; max: number } | null {
  const value = band.trim();
  if (/^23\+$/i.test(value) || /^23\s*or\s*older$/i.test(value)) {
    return { min: 23, max: Number.POSITIVE_INFINITY };
  }
  if (!/^\d{1,3}$/.test(value)) return null;
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
