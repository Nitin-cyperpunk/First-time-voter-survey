import type { ReferralPlatform } from "@/lib/referral-code";

export const REFERRAL_CODE_STORAGE_KEY = "concave_referral_code";
export const REFERRAL_PLATFORM_STORAGE_KEY = "concave_referral_platform";

export type ReferralAttribution = {
  code: string | null;
  platform: ReferralPlatform | null;
};

export function storeReferralAttribution(
  code: string,
  platform?: ReferralPlatform | null,
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(REFERRAL_CODE_STORAGE_KEY, code.trim().toUpperCase());
  if (platform) {
    sessionStorage.setItem(REFERRAL_PLATFORM_STORAGE_KEY, platform);
  } else {
    sessionStorage.removeItem(REFERRAL_PLATFORM_STORAGE_KEY);
  }
}

export function getReferralAttribution(): ReferralAttribution {
  if (typeof window === "undefined") {
    return { code: null, platform: null };
  }

  const code = sessionStorage.getItem(REFERRAL_CODE_STORAGE_KEY);
  const platform = sessionStorage.getItem(REFERRAL_PLATFORM_STORAGE_KEY);

  return {
    code: code?.trim() || null,
    platform: isReferralPlatform(platform) ? platform : null,
  };
}

export function clearReferralAttribution(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
  sessionStorage.removeItem(REFERRAL_PLATFORM_STORAGE_KEY);
}

function isReferralPlatform(value: string | null): value is ReferralPlatform {
  return value === "whatsapp" || value === "instagram" || value === "copy";
}
