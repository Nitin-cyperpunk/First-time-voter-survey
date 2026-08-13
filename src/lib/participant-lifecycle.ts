export const PARTICIPANT_STATUSES = [
  "terminated",
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
    terminated: [],
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
  not_eligible: "terminated",
  eligible: "completed",
  lead: "completed",
  under_review: "completed",
};

export function normalizeParticipantStatus(
  status: string,
): ParticipantStatus | null {
  const normalized = status.toLowerCase();
  if (LEGACY_STATUS_ALIASES[normalized]) {
    return LEGACY_STATUS_ALIASES[normalized];
  }
  if ((PARTICIPANT_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as ParticipantStatus;
  }
  return null;
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
    case "terminated":
      return "Not eligible for this study";
    case "completed":
      return "Form completed";
    case "paid":
      return "Paid";
    case "review_pass":
    case "review_fail":
      return "Under review";
    case "successful":
      return "Successful";
    case "unsuccessful":
      return "Unsuccessful";
    default:
      return "Form completed";
  }
}

export function isParticipantVisibleStatus(status: string): boolean {
  const normalized = normalizeParticipantStatus(status);
  return normalized !== "review_pass" && normalized !== "review_fail";
}

export function isTerminatedStatus(status: string): boolean {
  return normalizeParticipantStatus(status) === "terminated";
}

export function isQualifiedCompletionStatus(status: string): boolean {
  const normalized = normalizeParticipantStatus(status);
  return (
    normalized === "completed" ||
    normalized === "review_pass" ||
    normalized === "review_fail" ||
    normalized === "successful" ||
    normalized === "unsuccessful" ||
    normalized === "paid"
  );
}
