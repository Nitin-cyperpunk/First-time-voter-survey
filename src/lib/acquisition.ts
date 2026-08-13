export const ACQUISITION_SOURCE_OPTIONS = [
  "Instagram",
  "WhatsApp",
  "Friend",
  "Family",
  "Concave Insights",
  "Facebook",
  "LinkedIn",
  "Google Search",
  "Other",
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCE_OPTIONS)[number];

export const ACQUISITION_OTHER = "Other";

export type AcquisitionType = "direct" | "referral";

export const REFERRAL_PLATFORMS = ["whatsapp", "instagram", "copy"] as const;
export type ReferralPlatform = (typeof REFERRAL_PLATFORMS)[number];

export function normalizeReferralPlatform(
  value: string | null | undefined,
): ReferralPlatform | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (REFERRAL_PLATFORMS as readonly string[]).includes(normalized)
    ? (normalized as ReferralPlatform)
    : null;
}
