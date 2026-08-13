import type { ParticipantStatus } from "@/lib/participant-lifecycle";

/**
 * Statuses that mean the participant is currently in the post-screener eligible
 * track (and may have progressed). Used for live "Eligible now" / cap math.
 */
export const ELIGIBLE_REACHED_STATUSES: readonly ParticipantStatus[] = [
  "eligible",
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
] as const;

/**
 * PostgREST `or` filter: currently eligible OR verification-phase rejects.
 * Verification rejects keep `call_disposition` (DM & Verify) or a manual
 * eligibility override — screener screen-outs have neither.
 */
export function eligibleReachedOrFilter(): string {
  const statusList = ELIGIBLE_REACHED_STATUSES.join(",");
  return [
    `status.in.(${statusList})`,
    "and(status.eq.not_eligible,call_disposition.not.is.null)",
    "and(status.eq.not_eligible,eligibility_manual_override.eq.true)",
  ].join(",");
}

export const ACTIVE_LEAD_STATUSES: readonly ParticipantStatus[] = [
  "lead",
  "under_review",
] as const;
