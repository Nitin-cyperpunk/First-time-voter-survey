import { transitionParticipantStatus } from "@/server/services/lifecycle.service";
import { markReferralEarnedForReferredLeadId } from "@/server/repositories/referrals.repository";
import { findParticipantByLeadId } from "@/server/repositories/participants.repository";

export type QcOutcome = "pass" | "fail";

export async function markParticipantQc(leadId: string, outcome: QcOutcome) {
  const participant = await findParticipantByLeadId(leadId);
  if (!participant) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  const reviewResult = await transitionParticipantStatus(
    leadId,
    outcome === "pass" ? "review_pass" : "review_fail",
    {
      changedBy: "admin",
      notes:
        outcome === "pass"
          ? "QC review passed"
          : "QC review failed",
    },
  );

  const finalResult = await transitionParticipantStatus(
    leadId,
    outcome === "pass" ? "successful" : "unsuccessful",
    {
      changedBy: "admin",
      notes:
        outcome === "pass"
          ? "Participant marked successful — referral reward marked earned"
          : "Participant marked unsuccessful",
    },
  );

  const earnedReferral =
    outcome === "pass"
      ? await markReferralEarnedForReferredLeadId(leadId)
      : null;

  return {
    participant: finalResult.participant,
    earnedReferral,
    changed: reviewResult.changed || finalResult.changed,
  };
}
