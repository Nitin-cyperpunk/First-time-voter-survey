"use client";

import { useState } from "react";

import { DashboardHeader } from "@/features/participant-dashboard/components/dashboard-header";
import { DashboardLayout } from "@/features/participant-dashboard/components/dashboard-layout";
import { EligibleInstagramPrompt } from "@/features/participant-dashboard/components/eligible-instagram-prompt";
import { useInstagramVerification } from "@/hooks/use-instagram-verification";
import { getInstagramVerificationMessage } from "@/lib/instagram-verification";
import { toastUnexpectedError } from "@/lib/toast";

type EligibleDashboardProps = {
  fullName: string;
  mobile: string;
  leadId: string;
};

export function EligibleDashboard({
  fullName,
  mobile,
  leadId,
}: EligibleDashboardProps) {
  const [preparingMessage, setPreparingMessage] = useState(false);
  const { startInstagramVerification, modal } = useInstagramVerification();

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

      <EligibleInstagramPrompt
        preparing={preparingMessage}
        onInstagramClick={() => void handleInstagramDm()}
      />

      {modal}
    </DashboardLayout>
  );
}
