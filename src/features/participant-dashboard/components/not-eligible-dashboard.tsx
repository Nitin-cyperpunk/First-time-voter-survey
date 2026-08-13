"use client";

import { useState } from "react";

import { DashboardHeader } from "@/features/participant-dashboard/components/dashboard-header";
import { DashboardLayout } from "@/features/participant-dashboard/components/dashboard-layout";
import { NotEligibleKeepEarningCard } from "@/features/participant-dashboard/components/not-eligible-keep-earning-card";
import { ReferEarnUpiCard } from "@/features/participant-dashboard/components/refer-earn-upi-card";
import { ReferralSummaryStats } from "@/features/participant-dashboard/components/referral-summary-stats";
import { StatusCard } from "@/features/participant-dashboard/components/status-card";
import { getDashboardStatusConfig } from "@/features/participant-dashboard/lib/dashboard-states";
import type { ParticipantDashboardData } from "@/features/participant-dashboard/types";

type NotEligibleDashboardProps = {
  data: ParticipantDashboardData;
};

export function NotEligibleDashboard({ data }: NotEligibleDashboardProps) {
  const [upiId, setUpiId] = useState(data.upiId);
  const statusConfig = getDashboardStatusConfig("not_eligible");

  const stats = data.referralStats ?? {
    referredCount: 0,
    qualifiedCount: 0,
    totalEarned: 0,
  };

  return (
    <DashboardLayout>
      <DashboardHeader fullName={data.fullName} />

      <StatusCard
        badgeLabel={statusConfig.badgeLabel}
        title={statusConfig.title}
        message={statusConfig.message}
        tone={statusConfig.tone}
        showBadge={false}
      />

      <ReferEarnUpiCard
        totalEarned={stats.totalEarned}
        qualifiedCount={stats.qualifiedCount}
        upiId={upiId}
        onSaved={setUpiId}
        referralRewardAmount={data.referralRewardAmount}
      />

      <ReferralSummaryStats stats={stats} variant="notEligible" />

      <NotEligibleKeepEarningCard referralLink={data.referralLink} />
    </DashboardLayout>
  );
}
