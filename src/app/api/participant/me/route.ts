import { NextResponse } from "next/server";

import {
  buildSurveyUrl,
  canAccessSurvey,
  toSurveyAccessFields,
} from "@/lib/survey-token.service";
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
import { hasSurveyResponse } from "@/server/repositories/survey.repository";

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

    const [screenerSubmitted, surveySubmitted, rewards] = await Promise.all([
      hasScreenerResponse(participant.leadId),
      hasSurveyResponse(participant.leadId),
      getRewardAmounts(),
    ]);

    const accessFields = toSurveyAccessFields(participant);
    const canSubmitSurvey =
      canAccessSurvey(accessFields) && !surveySubmitted;

    const normalized = normalizeParticipantStatus(participant.status);
    const upiRequired =
      normalized === "successful" && !participant.upiId?.trim();

    const surveyUrl =
      participant.surveyAccessGranted && participant.surveyToken
        ? buildSurveyUrl(participant.surveyToken)
        : null;

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
      surveySubmitted,
      canSubmitSurvey,
      refillRequired: participant.refillRequired,
      showReferral: shouldShowReferral(participant),
      upiRequired,
      surveyAccessGranted: participant.surveyAccessGranted,
      surveyUrl,
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
