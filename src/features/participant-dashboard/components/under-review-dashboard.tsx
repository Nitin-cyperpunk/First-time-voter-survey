import { Loader2Icon } from "lucide-react";

import { DashboardHeader } from "@/features/participant-dashboard/components/dashboard-header";
import { DashboardLayout } from "@/features/participant-dashboard/components/dashboard-layout";
import { StatusCard } from "@/features/participant-dashboard/components/status-card";
import { getDashboardStatusConfig } from "@/features/participant-dashboard/lib/dashboard-states";

type UnderReviewDashboardProps = {
  fullName: string;
};

export function UnderReviewDashboard({ fullName }: UnderReviewDashboardProps) {
  const statusConfig = getDashboardStatusConfig("under_review");

  return (
    <DashboardLayout>
      <DashboardHeader fullName={fullName} />

      <StatusCard
        badgeLabel={statusConfig.badgeLabel}
        title={statusConfig.title}
        message={
          "We are reviewing your registration.\n\nPlease wait while we verify your eligibility.\n\nThis usually takes 45–60 seconds."
        }
        tone={statusConfig.tone}
      />

      <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-4 py-4">
          <Loader2Icon className="size-10 animate-spin text-primary" />
          <p className="text-center text-sm font-semibold text-plum-muted">
            Verifying your eligibility…
          </p>
          <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-border">
            <div className="h-full w-full animate-pulse rounded-full bg-primary" />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
