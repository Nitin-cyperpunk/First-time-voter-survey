import { getAppUrl } from "@/lib/app-url";

export const REFERRAL_CODE_PREFIX = "FTV";
const REFERRAL_CODE_PATTERN = /^FTV[23456789A-HJ-NP-Z]{6}$/;

export function isValidReferralCodeFormat(code: string): boolean {
  return REFERRAL_CODE_PATTERN.test(normalizeReferralCode(code));
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

export type ReferralPlatform = "whatsapp" | "instagram" | "copy";

const REFERRAL_PLATFORM_PATH: Record<ReferralPlatform, string> = {
  whatsapp: "w",
  instagram: "i",
  copy: "c",
};

export function buildReferralLink(
  referralCode: string,
  options?: { baseUrl?: string },
): string {
  const normalized = normalizeReferralCode(referralCode);
  const origin = (options?.baseUrl ?? getAppUrl()).replace(/\/$/, "");
  return `${origin}/r/${encodeURIComponent(normalized)}`;
}

export function buildTrackedReferralLink(
  referralCode: string,
  platform: ReferralPlatform,
  options?: { baseUrl?: string },
): string {
  const normalized = normalizeReferralCode(referralCode);
  const origin = (options?.baseUrl ?? getAppUrl()).replace(/\/$/, "");
  const segment = REFERRAL_PLATFORM_PATH[platform];
  return `${origin}/r/${segment}/${encodeURIComponent(normalized)}`;
}
