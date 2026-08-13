import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LaunchDashboard } from "@/features/launch/components/launch-dashboard";
import { getAuthenticatedParticipant } from "@/lib/auth/participant-session";

export const dynamic = "force-dynamic";

export default async function ParticipantDashboardPage() {
  const participant = await getAuthenticatedParticipant();
  if (!participant) redirect("/login");

  return (
    <Suspense fallback={<p className="text-sm text-plum-muted">Loading...</p>}>
      <LaunchDashboard />
    </Suspense>
  );
}
