import type { EligibilityValue } from "@/lib/participant-lifecycle";
import { isUnderReviewStatus } from "@/lib/participant-lifecycle";
import { isEligibilityAccepting } from "@/lib/study-config/gates";
import { transitionParticipantStatus } from "@/server/services/lifecycle.service";
import {
  countParticipantsByIp,
  findParticipantByLeadId,
  updateParticipantDuplicateFlag,
} from "@/server/repositories/participants.repository";
import { hasRegistrationFormTerminations } from "@/server/repositories/form-terminations.repository";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";

export type EligibilityDecision = {
  eligible: boolean;
  status: EligibilityValue;
  duplicateCount: number;
  manualOverride?: boolean;
};

export function resolveEligibilityStatus(
  duplicateCount: number,
): EligibilityValue {
  return duplicateCount <= 1 ? "eligible" : "not_eligible";
}

/**
 * Persists is_flagged_duplicate from shared-IP count. Safe to call at registration
 * without changing lifecycle status (the 60s review window still applies).
 */
export async function syncIpDuplicateFlag(
  participantId: string,
  ipAddress: string | null | undefined,
): Promise<number> {
  const duplicateCount = ipAddress
    ? await countParticipantsByIp(ipAddress)
    : 1;

  await updateParticipantDuplicateFlag(participantId, duplicateCount > 1);

  return duplicateCount;
}

/**
 * Single source of truth for automatic eligibility after registration or refill.
 * Skips status changes when an admin has set a manual override (Option B).
 */
export async function determineEligibility(
  participantId: string,
  ipAddress: string | null | undefined,
): Promise<EligibilityDecision> {
  const participant = await findParticipantByLeadId(participantId);
  if (!participant) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  const duplicateCount = await syncIpDuplicateFlag(participantId, ipAddress);

  if (await hasRegistrationFormTerminations(participantId)) {
    if (participant.status !== "not_eligible") {
      await transitionParticipantStatus(participantId, "not_eligible", {
        changedBy: "system",
        notes: "Registration form termination rule matched",
      });
    }

    return {
      eligible: false,
      status: "not_eligible",
      duplicateCount,
    };
  }

  if (participant.eligibilityManualOverride) {
    const status =
      participant.status === "eligible" || participant.status === "not_eligible"
        ? (participant.status as EligibilityValue)
        : resolveEligibilityStatus(duplicateCount);

    if (
      isUnderReviewStatus(participant.status) &&
      participant.status !== status
    ) {
      if (status === "eligible") {
        const studyConfig = await getStudyConfig();
        if (!isEligibilityAccepting(studyConfig)) {
          return {
            eligible: false,
            status: "not_eligible",
            duplicateCount,
            manualOverride: true,
          };
        }
      }

      await transitionParticipantStatus(participantId, status, {
        changedBy: "system",
        notes: "Admin override preserved; resolving from under review",
      });
    }

    return {
      eligible: status === "eligible",
      status,
      duplicateCount,
      manualOverride: true,
    };
  }

  const status = resolveEligibilityStatus(duplicateCount);
  const studyConfig = await getStudyConfig();

  // Cap / project closed: do not promote to eligible; leave under_review.
  if (status === "eligible" && !isEligibilityAccepting(studyConfig)) {
    return {
      eligible: false,
      status: "not_eligible",
      duplicateCount,
    };
  }

  if (participant.status !== status) {
    await transitionParticipantStatus(participantId, status, {
      changedBy: "system",
      notes:
        duplicateCount <= 1
          ? "Automatic eligibility: unique IP registration"
          : `Automatic eligibility: ${duplicateCount} registrations detected from IP`,
    });
  }

  return {
    eligible: status === "eligible",
    status,
    duplicateCount,
  };
}

export {
  addMonths,
  buildCoolOffMessage,
  computeEligibleUntil,
  formatEligibleDate,
  isEligibleForParticipation,
  isWithinCoolOff,
} from "@/lib/participation-cooloff";
