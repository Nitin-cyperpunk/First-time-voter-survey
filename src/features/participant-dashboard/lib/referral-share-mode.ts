import {
  normalizeParticipantStatus,
  type ParticipantStatus,
} from "@/lib/participant-lifecycle";

export type ReferralShareMode =
  | "instagram_only"
  | "whatsapp_only"
  | "both"
  | "none";

export function resolveReferralShareMode(status: string): ReferralShareMode {
  const normalized = normalizeParticipantStatus(status);

  if (normalized === "eligible") return "both";
  if (normalized === "not_eligible") return "both";
  return "none";
}

export function isEligibleStatus(status: string): boolean {
  return normalizeParticipantStatus(status) === "eligible";
}

export function isNotEligibleStatus(status: string): boolean {
  return normalizeParticipantStatus(status) === "not_eligible";
}

export function isUnderReviewParticipantStatus(
  status: string,
): status is ParticipantStatus {
  const normalized = normalizeParticipantStatus(status);
  return normalized === "under_review" || normalized === "lead";
}
