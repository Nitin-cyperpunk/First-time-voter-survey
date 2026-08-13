import {
  normalizeParticipantStatus,
  type ParticipantStatus,
} from "@/lib/participant-lifecycle";
import type { DashboardStatusConfig } from "@/features/participant-dashboard/types";

const DASHBOARD_STATUS_CONFIG: Record<ParticipantStatus, DashboardStatusConfig> =
  {
    terminated: {
      status: "terminated",
      badgeLabel: "NOT ELIGIBLE",
      title: "Not a match this time",
      message:
        "You're not eligible for this particular study — but you can still share with friends and family who may be interested!",
      tone: "softNegative",
      showSurveyLocked: false,
      showSurveyCta: false,
    },
    completed: {
      status: "completed",
      badgeLabel: "FORM COMPLETED",
      title: "Thank you!",
      message: "Your responses are under review.",
      tone: "positive",
      showSurveyLocked: false,
      showSurveyCta: false,
    },
    review_pass: {
      status: "review_pass",
      badgeLabel: "UNDER REVIEW",
      title: "Thank you!",
      message: "Your responses are under review.",
      tone: "review",
      showSurveyLocked: false,
      showSurveyCta: false,
    },
    review_fail: {
      status: "review_fail",
      badgeLabel: "UNDER REVIEW",
      title: "Thank you!",
      message: "Your responses are under review.",
      tone: "review",
      showSurveyLocked: false,
      showSurveyCta: false,
    },
    successful: {
      status: "successful",
      badgeLabel: "SUCCESSFUL",
      title: "Study Completed Successfully",
      message:
        "Congratulations! You have successfully completed the study.",
      tone: "positive",
      showSurveyLocked: false,
      showSurveyCta: false,
    },
    unsuccessful: {
      status: "unsuccessful",
      badgeLabel: "UNSUCCESSFUL",
      title: "Study Update",
      message:
        "Thank you for your participation. Unfortunately, your submission did not meet the study requirements.",
      tone: "negative",
      showSurveyLocked: false,
      showSurveyCta: false,
    },
    paid: {
      status: "paid",
      badgeLabel: "PAID",
      title: "Payment Processed",
      message:
        "Your payment has been processed.\n\nThank you for participating.",
      tone: "positive",
      showSurveyLocked: false,
      showSurveyCta: false,
    },
  };

const DEFAULT_CONFIG = DASHBOARD_STATUS_CONFIG.completed;

export function getDashboardStatusConfig(
  status: string,
): DashboardStatusConfig {
  const normalized = normalizeParticipantStatus(status);
  if (!normalized) return DEFAULT_CONFIG;
  return DASHBOARD_STATUS_CONFIG[normalized];
}
