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
 * Completed users keep the thank-you view so referral counts stay visible;
 * UPI is collected on that screen rather than replacing it.
 */
export function resolveDashboardView(
  data: ParticipantDashboardData,
): DashboardView {
  const status = normalizeParticipantStatus(data.status);

  if (status === "terminated") return "terminated";
  if (status === "paid") return "paid";
  if (
    status === "completed" ||
    status === "review_pass" ||
    status === "review_fail" ||
    status === "successful"
  ) {
    return "survey_completed";
  }

  if (data.upiRequired) return "upi";

  return "default";
}
