export type MetricBreakdown = {
  label: string;
  count: number;
  percentage: number;
};

export type {
  FunnelSnapshot,
  FunnelSnapshotStatus,
  FunnelStage,
  DropSeverity,
} from "@/features/respondents/lib/funnel-snapshot";

export type SurveyTimingMetrics = {
  available: boolean;
  sampleSize: number;
  medianDurationSec: number | null;
  abandonmentNote: string | null;
};

export type DashboardMetrics = {
  totalRespondents: number;
  totalReferrals: number;
  activeLeads: number;
  completedReferrals: number;
  pendingReferrals: number;
  acquisitionBySource: MetricBreakdown[];
  acquisitionByType: MetricBreakdown[];
  referralByPlatform: MetricBreakdown[];
  terminationsByReason: MetricBreakdown[];
  terminationsAvailable: boolean;
  geographyByCity: MetricBreakdown[];
  surveyTiming: SurveyTimingMetrics;
  kpis: {
    registered: number;
    eligible: number;
    eligibleReached: number;
    notVerified: number;
    verified: number;
    completed: number;
    fraudFlagged: number;
    paid: number;
    overrides: number;
  };
  funnel: import("@/features/respondents/lib/funnel-snapshot").FunnelSnapshot;
  config: {
    target: number;
    buffer: number;
    closesAt: number;
    survey_active: boolean;
    eligibility_open: boolean;
    screener_open: boolean;
    project_open: boolean;
  };
  syncedAt: string;
};
