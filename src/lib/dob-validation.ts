const MIN_AGE_YEARS = 18;

export function isValidDobFormat(dob: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dob.trim());
}

export function isAdult(
  dob: string,
  referenceDate: Date = new Date(),
): boolean {
  if (!isValidDobFormat(dob)) return false;

  const [year, month, day] = dob.split("-").map(Number);
  const birthDate = new Date(year, month - 1, day);
  if (Number.isNaN(birthDate.getTime())) return false;

  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age >= MIN_AGE_YEARS;
}

export function isFutureDob(
  dob: string,
  referenceDate: Date = new Date(),
): boolean {
  if (!isValidDobFormat(dob)) return false;

  const [year, month, day] = dob.split("-").map(Number);
  const birthDate = new Date(year, month - 1, day);
  if (Number.isNaN(birthDate.getTime())) return false;

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  birthDate.setHours(0, 0, 0, 0);
  return birthDate.getTime() > today.getTime();
}

export function validateDob(dob: string): string | null {
  const trimmed = dob.trim();
  if (!trimmed) return "Date of birth is required.";
  if (!isValidDobFormat(trimmed)) {
    return "Enter a valid date of birth (YYYY-MM-DD).";
  }
  if (isFutureDob(trimmed)) {
    return "Date of birth cannot be in the future.";
  }
  if (!isAdult(trimmed)) return "You must be at least 18 years old.";
  return null;
}
