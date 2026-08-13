"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  toastEligibleForSurvey,
  toastNotEligibleSurveyUnavailable,
  toastRefillSubmitted,
  toastRegistrationUpdateRequested,
  toastWelcomeBack,
} from "@/lib/toast";
import {
  isAwaitingEligibilityDecision,
} from "@/lib/participant-lifecycle";
import { ParticipantDashboard } from "@/features/participant-dashboard/components/participant-dashboard";
import type { ParticipantDashboardData } from "@/features/participant-dashboard/types";

const POLL_INTERVAL_MS = 12_000;

export function LaunchDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refillSubmitted = searchParams.get("refillSubmitted") === "1";
  const welcomeBack = searchParams.get("welcomeBack") === "1";
  const refillToastShown = useRef(false);
  const welcomeBackToastShown = useRef(false);
  const previousStatusRef = useRef<string | null>(null);
  const eligibilityToastShown = useRef(false);

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
    const previousStatus = previousStatusRef.current;

    if (
      previousStatus &&
      isAwaitingEligibilityDecision(previousStatus) &&
      !eligibilityToastShown.current
    ) {
      if (payload.status === "eligible") {
        eligibilityToastShown.current = true;
        toastEligibleForSurvey();
      } else if (payload.status === "not_eligible") {
        eligibilityToastShown.current = true;
        toastNotEligibleSurveyUnavailable();
      }
    }

    previousStatusRef.current = payload.status;
    setData(payload);
    return payload;
  }, [router]);

  useEffect(() => {
    if (refillSubmitted) {
      toastRefillSubmitted();
    }
  }, [refillSubmitted]);

  useEffect(() => {
    if (!welcomeBack || welcomeBackToastShown.current) return;
    welcomeBackToastShown.current = true;
    toastWelcomeBack();
    router.replace("/dashboard");
  }, [welcomeBack, router]);

  useEffect(() => {
    void loadDashboard()
      .then((payload) => {
        if (!payload) return;

        if (payload.refillRequired && !refillToastShown.current) {
          refillToastShown.current = true;
          toastRegistrationUpdateRequested();
        }
      })
      .catch(() => router.replace("/login?sessionExpired=1"))
      .finally(() => setLoading(false));
  }, [loadDashboard, router]);

  useEffect(() => {
    if (!data) return;

    const awaitingEligibility = isAwaitingEligibilityDecision(data.status);

    if (!awaitingEligibility) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadDashboard().catch(() => {
        // Keep showing the current dashboard if a poll fails transiently.
      });
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [
    data?.status,
    loadDashboard,
  ]);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm font-semibold text-plum-muted">Loading...</p>
      </div>
    );
  }

  return <ParticipantDashboard data={data} />;
}
