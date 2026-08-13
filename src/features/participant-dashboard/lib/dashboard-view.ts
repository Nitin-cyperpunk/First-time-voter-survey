import { normalizeParticipantStatus } from "@/lib/participant-lifecycle";
import type { ParticipantDashboardData } from "@/features/participant-dashboard/types";

export type DashboardView =
  | "refill"
  | "upi"
  | "under_review"
  | "eligible"
  | "not_eligible"
  | "survey_completed"
  | "paid"
  | "default";

/**
 * Single visible dashboard state — priority order from product spec.
 */
export function resolveDashboardView(
  data: ParticipantDashboardData,
): DashboardView {
  if (data.refillRequired) return "refill";
  if (data.upiRequired) return "upi";

  const status = normalizeParticipantStatus(data.status);

  if (status === "under_review" || status === "lead") return "under_review";
  if (status === "eligible") return "eligible";
  if (status === "not_eligible") return "not_eligible";
  if (status === "paid") return "paid";
  if (
    status === "completed" ||
    status === "review_pass" ||
    status === "review_fail"
  ) {
    return "survey_completed";
  }

  return "default";
}
