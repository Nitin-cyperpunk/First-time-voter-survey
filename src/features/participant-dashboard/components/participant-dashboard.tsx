"use client";

import { useState } from "react";

import { DashboardHeader } from "@/features/participant-dashboard/components/dashboard-header";
import { DashboardLayout } from "@/features/participant-dashboard/components/dashboard-layout";
import { NotEligibleDashboard } from "@/features/participant-dashboard/components/not-eligible-dashboard";
import { ReferEarnUpiCard } from "@/features/participant-dashboard/components/refer-earn-upi-card";
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
  const [upiId, setUpiId] = useState(data.upiId);

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
          <ReferEarnUpiCard
            totalEarned={0}
            qualifiedCount={0}
            upiId={upiId}
            onSaved={setUpiId}
            variant="survey"
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
