import { transitionParticipantStatus } from "@/server/services/lifecycle.service";
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
        outcome === "pass" ? "QC review passed" : "QC review failed",
    },
  );

  const finalResult = await transitionParticipantStatus(
    leadId,
    outcome === "pass" ? "successful" : "unsuccessful",
    {
      changedBy: "admin",
      notes:
        outcome === "pass"
          ? "Participant marked successful"
          : "Participant marked unsuccessful",
    },
  );

  return {
    participant: finalResult.participant,
    changed: reviewResult.changed || finalResult.changed,
  };
}
