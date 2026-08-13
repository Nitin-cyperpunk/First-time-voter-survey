const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9._-]{2,64}$/;

export function isValidUpiId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320) return false;
  return UPI_ID_PATTERN.test(trimmed);
}

export function normalizeUpiId(value: string): string {
  return value.trim().toLowerCase();
}
