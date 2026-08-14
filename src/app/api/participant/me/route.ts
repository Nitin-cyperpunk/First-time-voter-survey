import { NextResponse } from "next/server";

import {
  formatParticipantStatusLabel,
  isTerminatedStatus,
  normalizeParticipantStatus,
} from "@/lib/participant-lifecycle";
import { getAuthenticatedParticipant, participantUnauthorizedResponse } from "@/lib/auth/participant-session";
import { originFromRequest } from "@/lib/app-url";
import { buildReferralLink } from "@/lib/referral-code.service";
import { getRewardAmounts } from "@/lib/study-config/rewards";
import { getParticipantReferralStats } from "@/server/repositories/referral-stats.repository";
import { hasScreenerResponse } from "@/server/repositories/screener.repository";

export async function GET(request: Request) {
  try {
    const participant = await getAuthenticatedParticipant();

    if (!participant) {
      return participantUnauthorizedResponse();
    }

    const [screenerSubmitted, rewards] = await Promise.all([
      hasScreenerResponse(participant.leadId),
      getRewardAmounts(),
    ]);

    const normalized = normalizeParticipantStatus(participant.status);
    const upiRequired =
      normalized === "successful" && !participant.upiId?.trim();

    const referralStats = isTerminatedStatus(participant.status)
      ? await getParticipantReferralStats(participant.leadId)
      : null;

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
