import type { SurveyAnalyticsExport } from "@/analytics/types";

export function analyticsToResponseTimes(
  analytics: SurveyAnalyticsExport | null | undefined,
): Record<string, number> | undefined {
  if (!analytics?.questions) return undefined;

  const times: Record<string, number> = {};
  for (const [questionId, metrics] of Object.entries(analytics.questions)) {
    times[questionId] = Math.max(0, Math.round(metrics.time_ms / 1000));
  }

  return Object.keys(times).length > 0 ? times : undefined;
}

export function attachAnalyticsToSubmission<
  T extends {
    startedAt?: string;
    submittedAt?: string;
    responseTimes?: Record<string, number>;
    analytics?: SurveyAnalyticsExport;
  },
>(payload: T, analytics: SurveyAnalyticsExport | null): T {
  if (!analytics) return payload;

  return {
    ...payload,
    analytics,
    startedAt: payload.startedAt ?? analytics.survey.started_at,
    submittedAt:
      payload.submittedAt ?? analytics.survey.submitted_at ?? undefined,
    responseTimes:
      payload.responseTimes ?? analyticsToResponseTimes(analytics),
  };
}
