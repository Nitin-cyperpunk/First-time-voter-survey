import { getAppUrl } from "@/lib/app-url";
import { normalizeReferralCode } from "@/lib/referral-code";

export function buildReferralLeadLink(
  referralCode: string,
  options?: { baseUrl?: string },
): string {
  const normalized = normalizeReferralCode(referralCode);
  const origin = (options?.baseUrl ?? getAppUrl()).replace(/\/$/, "");
  return `${origin}/ref/${encodeURIComponent(normalized)}`;
}
