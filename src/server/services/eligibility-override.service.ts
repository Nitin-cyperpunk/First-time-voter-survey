import type { EligibilityValue } from "@/lib/participant-lifecycle";
import {
  canAdminSetEligibility,
  canTransition,
  isEligibilityValue,
} from "@/lib/participant-lifecycle";
import {
  findParticipantByLeadId,
  setAdminEligibilityOverride,
} from "@/server/repositories/participants.repository";
import { transitionParticipantStatus } from "@/server/services/lifecycle.service";

/**
 * Admin hybrid override: set eligible / not_eligible.
 * Reason is optional for both outcomes.
 * Locks automatic IP recalculation until changed by a future admin action.
 */
export async function setAdminEligibility(
  leadId: string,
  eligibility: EligibilityValue,
  reason: string,
) {
  const participant = await findParticipantByLeadId(leadId);
  if (!participant) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  if (!canAdminSetEligibility(participant.status)) {
    throw new Error("ELIGIBILITY_LOCKED");
  }

  if (!isEligibilityValue(eligibility)) {
    throw new Error("INVALID_ELIGIBILITY");
  }

  const trimmedReason = reason.trim();

  if (participant.status !== eligibility) {
    if (!canTransition(participant.status, eligibility)) {
      throw new Error("INVALID_TRANSITION");
    }

    await transitionParticipantStatus(leadId, eligibility, {
      changedBy: "admin",
      notes: trimmedReason
        ? `Admin eligibility override: ${trimmedReason}`
        : eligibility === "eligible"
          ? "Admin eligibility override: marked eligible"
          : "Admin eligibility override: marked not eligible",
    });
  }

  const updated = await setAdminEligibilityOverride(leadId, {
    reason: trimmedReason || null,
  });

  if (!updated) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  return {
    status: updated.status,
    eligibilityManualOverride: updated.eligibilityManualOverride,
    eligibilityOverrideReason: updated.eligibilityOverrideReason,
  };
}
