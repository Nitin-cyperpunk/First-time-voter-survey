import type { NextRequest } from "next/server";

import {
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from "@/lib/referral-code";
import {
  buildReferralAttributionRedirectResponse,
  referralAttributionNotFoundResponse,
} from "@/lib/referral-routes";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const normalized = normalizeReferralCode(code);

  if (!isValidReferralCodeFormat(normalized)) {
    return referralAttributionNotFoundResponse();
  }

  return buildReferralAttributionRedirectResponse(normalized);
}
