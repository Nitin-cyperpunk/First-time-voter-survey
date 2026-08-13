import { NextResponse } from "next/server";

import {
  formatParticipantStatusLabel,
  isUnderReviewStatus,
  normalizeParticipantStatus,
} from "@/lib/participant-lifecycle";
import { getAuthenticatedParticipant, participantUnauthorizedResponse } from "@/lib/auth/participant-session";
import { buildReferralLink } from "@/lib/referral-code.service";
import { getRewardAmounts } from "@/lib/study-config/rewards";
import { processPendingEligibilityIfReady } from "@/server/services/pending-eligibility.service";
import { getParticipantReferralStats } from "@/server/repositories/referral-stats.repository";
import { hasScreenerResponse } from "@/server/repositories/screener.repository";

function shouldShowReferral(participant: {
  refillRequired: boolean;
  status: string;
}) {
  if (participant.refillRequired) return false;
  if (isUnderReviewStatus(participant.status)) return false;
  return true;
}

export async function GET() {
  try {
    let participant = await getAuthenticatedParticipant();

    if (!participant) {
      return participantUnauthorizedResponse();
    }

    const refreshed = await processPendingEligibilityIfReady(participant.leadId);
    if (refreshed) {
      participant = refreshed;
    }

    const [screenerSubmitted, rewards] = await Promise.all([
      hasScreenerResponse(participant.leadId),
      getRewardAmounts(),
    ]);

    const normalized = normalizeParticipantStatus(participant.status);
    const upiRequired =
      normalized === "successful" && !participant.upiId?.trim();

    const referralStats =
      normalizeParticipantStatus(participant.status) === "not_eligible"
        ? await getParticipantReferralStats(participant.leadId)
        : null;

    return NextResponse.json({
      fullName: participant.fullName,
      mobile: participant.mobile,
      leadId: participant.leadId,
      referralLink: buildReferralLink(participant.referralCode),
      status: participant.status,
      displayStatus: formatParticipantStatusLabel(participant.status),
      screenerSubmitted,
      surveySubmitted: false,
      canSubmitSurvey: false,
      refillRequired: participant.refillRequired,
      showReferral: shouldShowReferral(participant),
      upiRequired,
      surveyAccessGranted: false,
      surveyUrl: null,
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
