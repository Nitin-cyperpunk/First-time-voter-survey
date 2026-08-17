"use client";

import { useState } from "react";

import { DashboardHeader } from "@/features/participant-dashboard/components/dashboard-header";
import { DashboardLayout } from "@/features/participant-dashboard/components/dashboard-layout";
import { NotEligibleDashboard } from "@/features/participant-dashboard/components/not-eligible-dashboard";
import { ReferEarnUpiCard } from "@/features/participant-dashboard/components/refer-earn-upi-card";
import { ReferralCard } from "@/features/participant-dashboard/components/referral-card";
import { ReferralSummaryStats } from "@/features/participant-dashboard/components/referral-summary-stats";
import { StatusCard } from "@/features/participant-dashboard/components/status-card";
import { getDashboardStatusConfig } from "@/features/participant-dashboard/lib/dashboard-states";
import { resolveReferralShareMode } from "@/features/participant-dashboard/lib/referral-share-mode";
import { resolveDashboardView } from "@/features/participant-dashboard/lib/dashboard-view";
import type {
  ParticipantDashboardData,
  ParticipantReferralStats,
} from "@/features/participant-dashboard/types";

type ParticipantDashboardProps = {
  data: ParticipantDashboardData;
};

const EMPTY_STATS: ParticipantReferralStats = {
  referredCount: 0,
  qualifiedCount: 0,
  totalEarned: 0,
};

export function ParticipantDashboard({ data }: ParticipantDashboardProps) {
  const view = resolveDashboardView(data);
  const [upiId, setUpiId] = useState(data.upiId);

  if (view === "terminated") {
    return <NotEligibleDashboard data={data} />;
  }

  const statusConfig =
    view === "upi"
      ? {
          badgeLabel: "UPI REQUIRED",
          title: "Payment details needed",
          message:
            "Please provide your UPI ID so we can process your reward.",
          tone: "review" as const,
        }
      : getDashboardStatusConfig(data.status);

  const stats = data.referralStats ?? EMPTY_STATS;
  const shareMode = resolveReferralShareMode(data.status);
  const askUpiForSurvey =
    view === "upi" ||
    view === "survey_completed" ||
    view === "paid" ||
    data.upiRequired;

  return (
    <DashboardLayout>
      <DashboardHeader fullName={data.fullName} />

      <StatusCard
        badgeLabel={statusConfig.badgeLabel}
        title={statusConfig.title}
        message={statusConfig.message}
        tone={statusConfig.tone}
      />

      <ReferEarnUpiCard
        totalEarned={stats.totalEarned}
        qualifiedCount={stats.qualifiedCount}
        upiId={upiId}
        onSaved={setUpiId}
        referralRewardAmount={data.referralRewardAmount}
        variant={askUpiForSurvey ? "survey" : "referral"}
      />

      <ReferralSummaryStats stats={stats} />

      {data.showReferral && shareMode !== "none" ? (
        <ReferralCard
          referralLink={data.referralLink}
          shareMode={shareMode}
          referralRewardAmount={data.referralRewardAmount}
        />
      ) : null}
    </DashboardLayout>
  );
}
