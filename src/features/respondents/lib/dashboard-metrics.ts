import type {
  DashboardMetrics,
  MetricBreakdown,
  SurveyTimingMetrics,
} from "@/features/respondents/types";
import { aggregateNormalizedCitiesSplit } from "@/features/respondents/lib/city-normalization";
import { buildFunnelSnapshot } from "@/features/respondents/lib/funnel-snapshot";
import { QUALIFIED_COMPLETION_STATUSES } from "@/features/respondents/lib/metric-status-sets";
import { closesAt } from "@/lib/study-config/defaults";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";

function buildBreakdown(
  values: (string | null)[],
  fallbackLabel: string,
): MetricBreakdown[] {
  const total = values.length;
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value?.trim() || fallbackLabel;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function isMissingRelation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "42P01" || error.code === "PGRST205")
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const studyConfig = await getStudyConfig();
  const db = getSupabaseAdmin();

  const [
    registeredRes,
    completedRes,
    terminatedRes,
    paidRes,
    fraudRes,
    fraudLegacyRes,
    referralsRes,
    pendingReferralsRes,
    completedReferralsRes,
    acquisitionRes,
    cityRes,
    terminationsRes,
    timingRes,
  ] = await Promise.all([
    db.from("participants").select("*", { count: "exact", head: true }),
    db
      .from("participants")
      .select("*", { count: "exact", head: true })
      .in("status", [...QUALIFIED_COMPLETION_STATUSES]),
    db
      .from("participants")
      .select("*", { count: "exact", head: true })
      .eq("status", "terminated"),
    db
      .from("participants")
      .select("*", { count: "exact", head: true })
      .eq("status", "paid"),
    db
      .from("participants")
      .select("*", { count: "exact", head: true })
      .eq("duplicate_flag", true),
    db
      .from("participants")
      .select("*", { count: "exact", head: true })
      .eq("is_flagged_duplicate", true),
    db.from("referrals").select("*", { count: "exact", head: true }),
    db
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("reward_status", "pending"),
    db
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .in("reward_status", ["earned", "paid"]),
    db
      .from("participants")
      .select("acquisition_source, acquisition_type, referral_platform"),
    db.from("participants").select("city, status"),
    db
      .from("form_terminations")
      .select("rule_key, rule_label, reason_text")
      .eq("form_type", "registration"),
    db.from("screener_responses").select("total_duration_sec").limit(2000),
  ]);

  for (const result of [
    registeredRes,
    completedRes,
    terminatedRes,
    paidRes,
    referralsRes,
    pendingReferralsRes,
    completedReferralsRes,
    acquisitionRes,
    cityRes,
  ]) {
    if (result.error) throw result.error;
  }

  if (fraudRes.error && fraudRes.error.code !== "42703" && fraudRes.error.code !== "PGRST204") {
    throw fraudRes.error;
  }
  if (
    fraudLegacyRes.error &&
    fraudLegacyRes.error.code !== "42703" &&
    fraudLegacyRes.error.code !== "PGRST204"
  ) {
    throw fraudLegacyRes.error;
  }

  let terminationsByReason: MetricBreakdown[] = [];
  let terminationsAvailable = true;
  if (terminationsRes.error) {
    if (isMissingRelation(terminationsRes.error)) {
      terminationsAvailable = false;
    } else {
      throw terminationsRes.error;
    }
  } else {
    const labels = (terminationsRes.data ?? []).map(
      (row) =>
        row.rule_label?.trim() ||
        row.reason_text?.trim() ||
        row.rule_key?.trim() ||
        "Unknown",
    );
    terminationsByReason = buildBreakdown(labels, "Unknown").slice(0, 12);
  }

  let surveyTiming: SurveyTimingMetrics = {
    available: false,
    sampleSize: 0,
    medianDurationSec: null,
    abandonmentNote:
      "In-survey abandonment tracking needs per-screen abandon events — pending data source.",
  };
  if (!timingRes.error) {
    const durations = (timingRes.data ?? [])
      .map((row) => row.total_duration_sec)
      .filter((value): value is number => typeof value === "number" && value > 0);
    surveyTiming = {
      available: durations.length > 0,
      sampleSize: durations.length,
      medianDurationSec: median(durations),
      abandonmentNote:
        durations.length > 0
          ? "Median duration from survey responses. Stage-level abandonment pending richer analytics events."
          : "No survey duration samples yet.",
    };
  }

  const registered = registeredRes.count ?? 0;
  const completed = completedRes.count ?? 0;
  const terminated = terminatedRes.count ?? 0;
  const paid = paidRes.count ?? 0;
  const fraudFlagged = Math.max(
    fraudRes.count ?? 0,
    fraudLegacyRes.count ?? 0,
  );
  const referrals = referralsRes.count ?? 0;
  const pendingReferrals = pendingReferralsRes.count ?? 0;
  const completedReferrals = completedReferralsRes.count ?? 0;

  const rows = acquisitionRes.data ?? [];
  const acquisitionBySource = buildBreakdown(
    rows.map((row) => row.acquisition_source),
    "Unknown",
  );
  const acquisitionByType = buildBreakdown(
    rows.map((row) => row.acquisition_type),
    "Unspecified",
  );
  const referralByPlatform = buildBreakdown(
    rows
      .filter((row) => row.acquisition_type === "referral")
      .map((row) => row.referral_platform),
    "Unknown",
  );

  const qualified = new Set<string>(QUALIFIED_COMPLETION_STATUSES);
  const geographyByCity = aggregateNormalizedCitiesSplit(
    (cityRes.data ?? []).map((row) => ({
      city: row.city,
      qualified: qualified.has(row.status),
    })),
  ).slice(0, 15);

  const kpis = {
    registered,
    completed,
    terminated,
    fraudFlagged,
    paid,
  };

  const funnel = buildFunnelSnapshot(kpis, studyConfig);

  return {
    totalRespondents: registered,
    totalReferrals: referrals,
    completedReferrals,
    pendingReferrals,
    acquisitionBySource,
    acquisitionByType,
    referralByPlatform,
    terminationsByReason,
    terminationsAvailable,
    geographyByCity,
    surveyTiming,
    kpis,
    funnel,
    config: {
      target: studyConfig.target,
      buffer: studyConfig.buffer,
      closesAt: closesAt(studyConfig),
      form_status: studyConfig.form_status,
    },
    syncedAt: new Date().toISOString(),
  };
}
