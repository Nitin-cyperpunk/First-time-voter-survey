"use client";

import { DashboardHeader } from "@/features/participant-dashboard/components/dashboard-header";
import { DashboardLayout } from "@/features/participant-dashboard/components/dashboard-layout";
import { NotEligibleDashboard } from "@/features/participant-dashboard/components/not-eligible-dashboard";
import { ReferralCard } from "@/features/participant-dashboard/components/referral-card";
import { StatusCard } from "@/features/participant-dashboard/components/status-card";
import { getDashboardStatusConfig } from "@/features/participant-dashboard/lib/dashboard-states";
import { resolveReferralShareMode } from "@/features/participant-dashboard/lib/referral-share-mode";
import { resolveDashboardView } from "@/features/participant-dashboard/lib/dashboard-view";
import type { ParticipantDashboardData } from "@/features/participant-dashboard/types";

type ParticipantDashboardProps = {
  data: ParticipantDashboardData;
};

export function ParticipantDashboard({ data }: ParticipantDashboardProps) {
  const view = resolveDashboardView(data);

  switch (view) {
    case "upi":
      return (
        <DashboardLayout>
          <DashboardHeader fullName={data.fullName} />
          <StatusCard
            badgeLabel="UPI REQUIRED"
            title="Payment details needed"
            message="Please provide your UPI ID so we can process your reward."
            tone="review"
          />
        </DashboardLayout>
      );

    case "terminated":
      return <NotEligibleDashboard data={data} />;

    default: {
      const statusConfig = getDashboardStatusConfig(data.status);
      const shareMode = resolveReferralShareMode(data.status);

      return (
        <DashboardLayout>
          <DashboardHeader fullName={data.fullName} />

          <StatusCard
            badgeLabel={statusConfig.badgeLabel}
            title={statusConfig.title}
            message={statusConfig.message}
            tone={statusConfig.tone}
          />

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
  }
}
