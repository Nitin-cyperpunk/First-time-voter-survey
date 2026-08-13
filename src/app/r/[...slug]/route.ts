import type { NextRequest } from "next/server";

import {
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from "@/lib/referral-code";
import {
  buildReferralAttributionRedirectResponse,
  isReferralPlatformPathSegment,
  parseReferralPlatformPathSegment,
  referralAttributionNotFoundResponse,
} from "@/lib/referral-routes";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await context.params;

  if (!slug?.length) {
    return referralAttributionNotFoundResponse();
  }

  if (slug.length === 1) {
    const normalized = normalizeReferralCode(slug[0]);
    if (!isValidReferralCodeFormat(normalized)) {
      return referralAttributionNotFoundResponse();
    }
    return buildReferralAttributionRedirectResponse(normalized);
  }

  if (slug.length === 2) {
    const [platform, referralCode] = slug;
    if (!isReferralPlatformPathSegment(platform)) {
      return referralAttributionNotFoundResponse();
    }

    const normalized = normalizeReferralCode(referralCode);
    if (!isValidReferralCodeFormat(normalized)) {
      return referralAttributionNotFoundResponse();
    }

    const referralPlatform = parseReferralPlatformPathSegment(platform);
    return buildReferralAttributionRedirectResponse(normalized, referralPlatform);
  }

  return referralAttributionNotFoundResponse();
}
