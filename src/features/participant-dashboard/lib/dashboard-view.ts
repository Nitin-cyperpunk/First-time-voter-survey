import { normalizeParticipantStatus } from "@/lib/participant-lifecycle";
import type { ParticipantDashboardData } from "@/features/participant-dashboard/types";

export type DashboardView =
  | "upi"
  | "terminated"
  | "survey_completed"
  | "paid"
  | "default";

/**
 * Single visible dashboard state — priority order from product spec.
 */
export function resolveDashboardView(
  data: ParticipantDashboardData,
): DashboardView {
  if (data.upiRequired) return "upi";

  const status = normalizeParticipantStatus(data.status);

  if (status === "terminated") return "terminated";
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
