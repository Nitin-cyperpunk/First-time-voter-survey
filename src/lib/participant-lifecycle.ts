export type EligibilityValue = "eligible" | "not_eligible";

export function isEligibilityValue(value: unknown): value is EligibilityValue {
  return value === "eligible" || value === "not_eligible";
}

export const PARTICIPANT_STATUSES = [
  "lead",
  "under_review",
  "eligible",
  "not_eligible",
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
] as const;

export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

const VALID_TRANSITIONS: Record<ParticipantStatus, readonly ParticipantStatus[]> =
  {
    lead: ["eligible", "not_eligible", "under_review"],
    under_review: ["eligible", "not_eligible"],
    eligible: ["completed", "not_eligible"],
    not_eligible: ["eligible"],
    completed: ["review_pass", "review_fail"],
    review_pass: ["successful"],
    review_fail: ["unsuccessful"],
    successful: ["paid"],
    unsuccessful: [],
    paid: [],
  };

const LEGACY_STATUS_ALIASES: Record<string, ParticipantStatus> = {
  qc_pass: "review_pass",
  qc_fail: "review_fail",
  survey_completed: "completed",
};

export function normalizeParticipantStatus(status: string): ParticipantStatus | null {
  const normalized = status.toLowerCase();
  if (LEGACY_STATUS_ALIASES[normalized]) {
    return LEGACY_STATUS_ALIASES[normalized];
  }
  if ((PARTICIPANT_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as ParticipantStatus;
  }
  return null;
}

/** Statuses where admin may set eligible / not_eligible (pre-survey only). */
export const ADMIN_ELIGIBILITY_STATUSES = [
  "lead",
  "under_review",
  "eligible",
  "not_eligible",
] as const;

export function canAdminSetEligibility(status: string): boolean {
  const normalized = normalizeParticipantStatus(status);
  if (!normalized) return false;
  return (ADMIN_ELIGIBILITY_STATUSES as readonly string[]).includes(normalized);
}

export function canTransition(from: string, to: ParticipantStatus): boolean {
  const normalizedFrom = normalizeParticipantStatus(from);
  if (!normalizedFrom) return false;
  return VALID_TRANSITIONS[normalizedFrom].includes(to);
}

export function isTerminalStatus(status: string): boolean {
  const normalized = normalizeParticipantStatus(status);
  if (!normalized) return false;
  return VALID_TRANSITIONS[normalized].length === 0;
}

export class InvalidStatusTransitionError extends Error {
  readonly fromStatus: string;
  readonly toStatus: string;

  constructor(fromStatus: string, toStatus: string) {
    super(`INVALID_TRANSITION:${fromStatus}:${toStatus}`);
    this.name = "InvalidStatusTransitionError";
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

export function formatAdminStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function formatParticipantStatusLabel(status: string): string {
  const normalized = normalizeParticipantStatus(status) ?? status.toLowerCase();

  switch (normalized) {
    case "lead":
    case "under_review":
      return "Under Review";
    case "eligible":
      return "Eligible";
    case "not_eligible":
      return "Your application is currently under review or not eligible for this survey.";
    case "completed":
      return "Survey Completed";
    case "paid":
      return "Paid";
    case "review_pass":
    case "review_fail":
      return "Under Review";
    case "successful":
      return "Successful";
    case "unsuccessful":
      return "Unsuccessful";
    default:
      return "Under Review";
  }
}

export function isParticipantVisibleStatus(status: string): boolean {
  const normalized = normalizeParticipantStatus(status);
  return normalized !== "review_pass" && normalized !== "review_fail";
}

/** True while eligibility has not yet been resolved after registration. */
export function isUnderReviewStatus(status: string): boolean {
  const normalized = normalizeParticipantStatus(status);
  return normalized === "under_review" || normalized === "lead";
}

export function isAwaitingEligibilityDecision(status: string): boolean {
  return isUnderReviewStatus(status);
}
