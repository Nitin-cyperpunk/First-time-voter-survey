import type { Participant } from "@/types/domain";

export const DM_STATUSES = [
  "waiting_for_dm",
  "message_received",
  "call_pending",
  "verified",
  "survey_link_sent",
  "completed",
] as const;

export type DmStatus = (typeof DM_STATUSES)[number];

export const DM_STATUS_LABELS: Record<DmStatus, string> = {
  waiting_for_dm: "Waiting for DM",
  message_received: "Message Received",
  call_pending: "Call Pending",
  verified: "Verified",
  survey_link_sent: "Survey Link Sent",
  completed: "Completed",
};

export function isDmStatus(value: unknown): value is DmStatus {
  return (
    typeof value === "string" &&
    (DM_STATUSES as readonly string[]).includes(value)
  );
}

export function resolveDmStatus(participant: Participant): DmStatus {
  const stored = (participant as Participant & { dmStatus?: string | null })
    .dmStatus;
  if (isDmStatus(stored)) return stored;

  if (participant.status === "completed") return "completed";
  if (participant.surveyAccessGranted) return "survey_link_sent";
  if (participant.verifiedAt) return "verified";
  return "waiting_for_dm";
}

export function dmStatusVariant(
  status: DmStatus,
): "default" | "secondary" | "healthcare" | "finance" | "retail" | "technology" {
  switch (status) {
    case "waiting_for_dm":
      return "retail";
    case "message_received":
      return "technology";
    case "call_pending":
      return "finance";
    case "verified":
      return "healthcare";
    case "survey_link_sent":
      return "default";
    case "completed":
      return "secondary";
    default:
      return "secondary";
  }
}

export function isVerifiedDmStatus(status: DmStatus): boolean {
  return (
    status === "verified" ||
    status === "survey_link_sent" ||
    status === "completed"
  );
}

/** Operational label for admin tables (maps message_received → call_pending until verified). */
export function displayDmStatus(participant: Participant): DmStatus {
  const status = resolveDmStatus(participant);
  if (status === "message_received" && !participant.verifiedAt) {
    return "call_pending";
  }
  return status;
}
