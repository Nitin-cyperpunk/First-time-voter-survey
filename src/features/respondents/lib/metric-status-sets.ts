import type { ParticipantStatus } from "@/lib/participant-lifecycle";

/** Qualified form completions and downstream QC / payout statuses. */
export const QUALIFIED_COMPLETION_STATUSES: readonly ParticipantStatus[] = [
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
] as const;
