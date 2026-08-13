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

export function ageOutOfRangeMessage(config: StudyConfig): string {
  return `You must be between ${config.age_min} and ${config.age_max} years old to participate.`;
}
