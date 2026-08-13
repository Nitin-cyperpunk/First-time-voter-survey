"use client";

import { useState } from "react";

import { DashboardHeader } from "@/features/participant-dashboard/components/dashboard-header";
import { DashboardLayout } from "@/features/participant-dashboard/components/dashboard-layout";
import { EligibleInstagramPrompt } from "@/features/participant-dashboard/components/eligible-instagram-prompt";
import { EligibleSurveyCard } from "@/features/participant-dashboard/components/eligible-survey-card";
import { StatusCard } from "@/features/participant-dashboard/components/status-card";
import { getDashboardStatusConfig } from "@/features/participant-dashboard/lib/dashboard-states";
import { useInstagramVerification } from "@/hooks/use-instagram-verification";
import { getInstagramVerificationMessage } from "@/lib/instagram-verification";
import { toastUnexpectedError } from "@/lib/toast";

type EligibleDashboardProps = {
  fullName: string;
  mobile: string;
  leadId: string;
  surveyAccessGranted: boolean;
  surveyUrl: string | null;
};

export function EligibleDashboard({
  fullName,
  mobile,
  leadId,
  surveyAccessGranted,
  surveyUrl,
}: EligibleDashboardProps) {
  const [preparingMessage, setPreparingMessage] = useState(false);
  const { startInstagramVerification, modal } = useInstagramVerification();
  const statusConfig = getDashboardStatusConfig("eligible");

  async function handleInstagramDm() {
    setPreparingMessage(true);
    try {
      const message = await getInstagramVerificationMessage({
        fullName,
        mobile,
        leadId,
      });
      startInstagramVerification({ message });
    } catch {
      toastUnexpectedError();
    } finally {
      setPreparingMessage(false);
    }
  }

  return (
    <DashboardLayout>
      <DashboardHeader fullName={fullName} />

      {surveyAccessGranted && surveyUrl ? (
        <>
          <StatusCard
            badgeLabel={statusConfig.badgeLabel}
            title="Your survey is ready"
            message="Your survey access is ready. Use the button below to begin."
            tone={statusConfig.tone}
            showBadge={false}
          />
          <EligibleSurveyCard surveyUrl={surveyUrl} />
        </>
      ) : (
        <EligibleInstagramPrompt
          preparing={preparingMessage}
          onInstagramClick={() => void handleInstagramDm()}
        />
      )}

      {modal}
    </DashboardLayout>
  );
}
