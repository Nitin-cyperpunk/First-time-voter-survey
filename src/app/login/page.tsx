import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LaunchLoginForm } from "@/features/launch/components/launch-login-form";
import { getAuthenticatedParticipant } from "@/lib/auth/participant-session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // If a valid session already exists, skip login entirely.
  const participant = await getAuthenticatedParticipant();
  if (participant) {
    redirect("/dashboard?welcomeBack=1");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Suspense fallback={<p className="text-sm text-plum-muted">Loading...</p>}>
        <LaunchLoginForm />
      </Suspense>
    </div>
  );
}
