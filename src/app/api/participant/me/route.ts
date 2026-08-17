import { NextResponse } from "next/server";

import {
  formatParticipantStatusLabel,
  normalizeParticipantStatus,
} from "@/lib/participant-lifecycle";
import { getAuthenticatedParticipant, participantUnauthorizedResponse } from "@/lib/auth/participant-session";
import { originFromRequest } from "@/lib/app-url";
import { buildReferralLink } from "@/lib/referral-code.service";
import { getRewardAmounts } from "@/lib/study-config/rewards";
import { getParticipantReferralStats } from "@/server/repositories/referral-stats.repository";
import { hasScreenerResponse } from "@/server/repositories/screener.repository";

function needsUpiForEarnings(status: string, hasUpi: boolean): boolean {
  if (hasUpi) return false;
  const normalized = normalizeParticipantStatus(status);
  return (
    normalized === "completed" ||
    normalized === "review_pass" ||
    normalized === "review_fail" ||
    normalized === "successful"
  );
}

export async function GET(request: Request) {
  try {
    const participant = await getAuthenticatedParticipant();

    if (!participant) {
      return participantUnauthorizedResponse();
    }

    const [screenerSubmitted, rewards, referralStats] = await Promise.all([
      hasScreenerResponse(participant.leadId),
      getRewardAmounts(),
      getParticipantReferralStats(participant.leadId),
    ]);

    const hasUpi = Boolean(participant.upiId?.trim());
    const upiRequired = needsUpiForEarnings(participant.status, hasUpi);

    return NextResponse.json({
      fullName: participant.fullName,
      mobile: participant.mobile,
      leadId: participant.leadId,
      referralLink: buildReferralLink(participant.referralCode, {
        baseUrl: originFromRequest(request) ?? undefined,
      }),
      status: participant.status,
      displayStatus: formatParticipantStatusLabel(participant.status),
      screenerSubmitted,
      surveySubmitted: false,
      canSubmitSurvey: false,
      showReferral: true,
      upiRequired,
      upiId: participant.upiId,
      referralStats,
      referralRewardAmount: rewards.referralRewardAmount,
    });
  } catch (error) {
    console.error("GET /api/participant/me failed:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard." },
      { status: 500 },
    );
  }
}
