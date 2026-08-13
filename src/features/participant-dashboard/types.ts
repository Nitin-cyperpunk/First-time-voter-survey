import type { ParticipantStatus } from "@/lib/participant-lifecycle";

export type ParticipantDashboardData = {
  fullName: string;
  referralLink: string;
  status: string;
  displayStatus: string;
  screenerSubmitted: boolean;
  surveySubmitted: boolean;
  canSubmitSurvey: boolean;
  refillRequired: boolean;
  showReferral: boolean;
  upiRequired: boolean;
  surveyAccessGranted: boolean;
  surveyUrl: string | null;
  mobile: string;
  leadId: string;
  upiId: string | null;
  referralStats: ParticipantReferralStats | null;
  /** Live referral incentive from study_config (₹ per qualified friend). */
  referralRewardAmount: number;
};

export type ParticipantReferralStats = {
  referredCount: number;
  qualifiedCount: number;
  totalEarned: number;
};

export type DashboardTone =
  | "review"
  | "positive"
  | "neutral"
  | "negative"
  | "softNegative";

export type DashboardStatusConfig = {
  status: ParticipantStatus;
  badgeLabel: string;
  title: string;
  message: string;
  tone: DashboardTone;
  showSurveyLocked: boolean;
  showSurveyCta: boolean;
};
