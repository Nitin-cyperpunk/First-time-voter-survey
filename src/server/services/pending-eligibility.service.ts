import { determineEligibility } from "@/lib/eligibility";
import {
  isUnderReviewStatus,
} from "@/lib/participant-lifecycle";
import type { Participant } from "@/types/domain";
import {
  findParticipantByLeadId,
  getParticipantIpAddress,
} from "@/server/repositories/participants.repository";

/** Backend review window before automatic eligibility runs (45–60 seconds). */
export const ELIGIBILITY_REVIEW_DELAY_MS = 60 * 1000;

/**
 * Runs the eligibility service once the review window has elapsed and the
 * participant is still awaiting a decision. Safe to call on every poll.
 */
export async function processPendingEligibilityIfReady(
  leadId: string,
): Promise<Participant | null> {
  const participant = await findParticipantByLeadId(leadId);
  if (!participant || !isUnderReviewStatus(participant.status)) {
    return participant;
  }

  const elapsed = Date.now() - participant.createdAt.getTime();
  if (elapsed < ELIGIBILITY_REVIEW_DELAY_MS) {
    return participant;
  }

  const ipAddress = await getParticipantIpAddress(leadId);
  await determineEligibility(leadId, ipAddress);

  return findParticipantByLeadId(leadId);
}
