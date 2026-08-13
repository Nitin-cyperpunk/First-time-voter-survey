"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { toastWelcomeBack } from "@/lib/toast";
import { ParticipantDashboard } from "@/features/participant-dashboard/components/participant-dashboard";
import type { ParticipantDashboardData } from "@/features/participant-dashboard/types";

export function LaunchDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const welcomeBack = searchParams.get("welcomeBack") === "1";
  const welcomeBackToastShown = useRef(false);

  const [data, setData] = useState<ParticipantDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    const response = await fetch("/api/participant/me");

    if (response.status === 401) {
      router.replace("/login?sessionExpired=1");
      return null;
    }

    if (!response.ok) {
      throw new Error("Failed to load dashboard");
    }

    const payload = (await response.json()) as ParticipantDashboardData;
    setData(payload);
    return payload;
  }, [router]);

  useEffect(() => {
    if (!welcomeBack || welcomeBackToastShown.current) return;
    welcomeBackToastShown.current = true;
    toastWelcomeBack();
    router.replace("/dashboard");
  }, [welcomeBack, router]);

  useEffect(() => {
    void loadDashboard()
      .catch(() => router.replace("/login?sessionExpired=1"))
      .finally(() => setLoading(false));
  }, [loadDashboard, router]);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm font-semibold text-plum-muted">Loading...</p>
      </div>
    );
  }

  return <ParticipantDashboard data={data} />;
}
