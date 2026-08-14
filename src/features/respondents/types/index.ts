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

export type GeographyBreakdown = {
  label: string;
  completes: number;
  allParticipants: number;
  completePct: number;
};

export type DashboardMetrics = {
  totalRespondents: number;
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  acquisitionBySource: MetricBreakdown[];
  acquisitionByType: MetricBreakdown[];
  referralByPlatform: MetricBreakdown[];
  terminationsByReason: MetricBreakdown[];
  terminationsAvailable: boolean;
  geographyByCity: GeographyBreakdown[];
  surveyTiming: SurveyTimingMetrics;
  kpis: {
    registered: number;
    completed: number;
    terminated: number;
    fraudFlagged: number;
    paid: number;
  };
  funnel: import("@/features/respondents/lib/funnel-snapshot").FunnelSnapshot;
  config: {
    target: number;
    buffer: number;
    closesAt: number;
    form_status: "open" | "closed";
  };
  syncedAt: string;
};
