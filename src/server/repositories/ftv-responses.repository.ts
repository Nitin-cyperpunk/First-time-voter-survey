import {
  readFtvPayloadDuration,
  readFtvPayloadString,
  readFtvPayloadTimestamp,
  resolveFtvStatus,
  stampFtvRespondentId,
  type FtvStatus,
} from "@/lib/ftv-payload";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

type FtvInsertResult =
  | { ok: true }
  | { ok: false; code: string; error?: string };

type InsertFtvArgs = {
  p_respondent_id: string;
  p_survey_version: string;
  p_status: string;
  p_payload: Json;
  p_started_at: string | null;
  p_completed_at: string | null;
  p_terminated_at: string | null;
  p_duration_seconds: number | null;
  p_lead_id: string | null;
  p_city_id: string | null;
  p_referral_code?: string | null;
};

export function isMissingInsertFtvRpc(error: {
  message?: string;
  code?: string;
} | null): boolean {
  const message = error?.message ?? "";
  return (
    error?.code === "PGRST202" ||
    /Could not find the function public\.insert_ftv_response/i.test(message)
  );
}

export function isMissingReferralCodeColumn(error: {
  message?: string;
  code?: string;
} | null): boolean {
  const message = error?.message ?? "";
  return (
    /referral_code/i.test(message) &&
    (error?.code === "PGRST204" ||
      error?.code === "42703" ||
      /schema cache/i.test(message) ||
      /column/i.test(message))
  );
}

export function extractStoredFtvPayload(source: unknown): Record<string, unknown> | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const record = source as Record<string, unknown>;
  const nested = record.__ftv_payload;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const payload = nested as Record<string, unknown>;
    if (Array.isArray(payload.responses)) return payload;
  }
  if (Array.isArray(record.responses)) return record;
  const inner = record.payload;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const payload = inner as Record<string, unknown>;
    if (Array.isArray(payload.responses)) return payload;
  }
  return null;
}

async function rpcInsertFtv(args: InsertFtvArgs) {
  return getSupabaseAdmin().rpc("insert_ftv_response", args);
}

async function directInsertFtv(input: {
  respondentId: string;
  surveyVersion: string;
  status: FtvStatus;
  payload: Json;
  startedAt?: string | null;
  completedAt?: string | null;
  terminatedAt?: string | null;
  durationSeconds?: number | null;
  leadId?: string | null;
  cityId?: string | null;
  referralCode?: string | null;
}): Promise<FtvInsertResult> {
  const row = {
    respondent_id: input.respondentId,
    lead_id: input.leadId ?? null,
    city_id: input.cityId ?? null,
    referral_code: input.referralCode ?? null,
    survey_version: input.surveyVersion,
    status: input.status,
    started_at: input.startedAt ?? null,
    completed_at: input.completedAt ?? null,
    terminated_at: input.terminatedAt ?? null,
    duration_seconds: input.durationSeconds ?? null,
    payload: input.payload,
  };

  const first = await getSupabaseAdmin().from("ftv_responses").insert(row);
  if (!first.error) return { ok: true };
  if (!isMissingReferralCodeColumn(first.error)) {
    return { ok: false, code: "direct_insert_failed", error: first.error.message };
  }

  // Drop referral_code when the column is not yet migrated.
  const withoutReferral = {
    respondent_id: row.respondent_id,
    lead_id: row.lead_id,
    city_id: row.city_id,
    survey_version: row.survey_version,
    status: row.status,
    started_at: row.started_at,
    completed_at: row.completed_at,
    terminated_at: row.terminated_at,
    duration_seconds: row.duration_seconds,
    payload: row.payload,
  };
  const second = await getSupabaseAdmin().from("ftv_responses").insert(withoutReferral);
  if (second.error) {
    return { ok: false, code: "direct_insert_failed", error: second.error.message };
  }
  return { ok: true };
}

export async function insertFtvResponse(input: {
  respondentId: string;
  surveyVersion: string;
  status: FtvStatus;
  payload: Json;
  startedAt?: string | null;
  completedAt?: string | null;
  terminatedAt?: string | null;
  durationSeconds?: number | null;
  leadId?: string | null;
  cityId?: string | null;
  referralCode?: string | null;
}): Promise<FtvInsertResult> {
  const baseArgs: InsertFtvArgs = {
    p_respondent_id: input.respondentId,
    p_survey_version: input.surveyVersion,
    p_status: input.status,
    p_payload: input.payload,
    p_started_at: input.startedAt ?? null,
    p_completed_at: input.completedAt ?? null,
    p_terminated_at: input.terminatedAt ?? null,
    p_duration_seconds: input.durationSeconds ?? null,
    p_lead_id: input.leadId ?? null,
    p_city_id: input.cityId ?? null,
  };

  let { data, error } = await rpcInsertFtv({
    ...baseArgs,
    p_referral_code: input.referralCode ?? null,
  });

  if (error && isMissingInsertFtvRpc(error)) {
    ({ data, error } = await rpcInsertFtv(baseArgs));
  }

  if (!error) {
    const payload = data as { ok?: boolean; code?: string; error?: string } | null;
    if (payload?.ok) return { ok: true };
    if (payload?.code === "duplicate_respondent_id") {
      return { ok: false, code: "duplicate_respondent_id" };
    }
    return {
      ok: false,
      code: payload?.code ?? "ftv_insert_failed",
      error: payload?.error,
    };
  }

  if (!isMissingInsertFtvRpc(error)) {
    return { ok: false, code: "rpc_error", error: error.message };
  }

  return directInsertFtv(input);
}

/**
 * Dual-write the full FTV jsonb payload after screener/participant insert.
 * Never throws — analysis failure must not roll back registration.
 */
export async function persistFtvAnalysisResponse(input: {
  answerJson?: Record<string, unknown> | null;
  terminated?: boolean;
  terminations?: Array<{ ruleKey?: string | null }>;
  leadId: string;
  cityId?: string | null;
  startedAt?: Date | null;
  submittedAt?: Date | null;
  totalDurationSec?: number | null;
  screenerInserted: boolean;
  referralCode?: string | null;
}): Promise<boolean> {
  const answerJson = input.answerJson;
  if (!answerJson || Object.keys(answerJson).length === 0) return false;

  const status = resolveFtvStatus({
    payloadStatus: readFtvPayloadString(answerJson, "status"),
    terminated: input.terminated,
    terminations: input.terminations,
  });
  if (!status) return false;
  if (status === "COMPLETE" && !input.screenerInserted) return false;

  const surveyVersion =
    readFtvPayloadString(answerJson, "survey_version") ?? "FTV-v1";
  const startedAt =
    readFtvPayloadTimestamp(answerJson, "started_at") ??
    input.startedAt?.toISOString() ??
    null;
  const terminatedAt =
    readFtvPayloadTimestamp(answerJson, "terminated_at") ??
    (status.startsWith("TERMINATE_")
      ? (input.submittedAt?.toISOString() ?? null)
      : null);
  const completedAt = status.startsWith("TERMINATE_")
    ? null
    : (readFtvPayloadTimestamp(answerJson, "completed_at") ??
      input.submittedAt?.toISOString() ??
      null);
  const durationSeconds =
    readFtvPayloadDuration(answerJson) ?? input.totalDurationSec ?? null;

  const stamped = stampFtvRespondentId(answerJson, input.leadId);
  const result = await insertFtvResponse({
    respondentId: input.leadId,
    surveyVersion,
    status,
    payload: stamped as Json,
    startedAt,
    completedAt,
    terminatedAt,
    durationSeconds,
    leadId: input.leadId,
    cityId: input.cityId,
    referralCode: input.referralCode ?? null,
  });
  if (result.ok) return true;
  if (result.code === "duplicate_respondent_id") return true;
  console.error("[persistFtvAnalysisResponse] insert failed:", result);
  return false;
}

/** Recover FTV analysis rows when screener succeeded but insert_ftv_response missed. */
export async function backfillMissingFtvFromScreener(): Promise<{
  inserted: number;
  skipped: number;
}> {
  const supabase = getSupabaseAdmin();
  const { data: screeners, error: screenerError } = await supabase
    .from("screener_responses")
    .select(
      "lead_id, city_id, answers, analytics, started_at, submitted_at, total_duration_sec, completion_status, termination_reason",
    )
    .order("submitted_at", { ascending: false })
    .limit(500);
  if (screenerError) throw screenerError;

  const { data: existing, error: existingError } = await supabase
    .from("ftv_responses")
    .select("lead_id, respondent_id");
  if (existingError) throw existingError;

  const have = new Set<string>();
  for (const row of existing ?? []) {
    if (row.lead_id) have.add(row.lead_id);
    if (row.respondent_id) have.add(row.respondent_id);
  }

  let inserted = 0;
  let skipped = 0;
  for (const row of screeners ?? []) {
    if (!row.lead_id || have.has(row.lead_id)) continue;
    const payload =
      extractStoredFtvPayload(row.analytics) ?? extractStoredFtvPayload(row.answers);
    if (!payload || (row.completion_status === "Completed" && !row.city_id)) {
      skipped += 1;
      continue;
    }
    const ok = await persistFtvAnalysisResponse({
      answerJson: payload,
      terminated: row.completion_status === "Terminated",
      terminations: row.termination_reason
        ? [{ ruleKey: row.termination_reason }]
        : [],
      leadId: row.lead_id,
      cityId: row.city_id ?? "",
      startedAt: row.started_at ? new Date(row.started_at) : null,
      submittedAt: row.submitted_at ? new Date(row.submitted_at) : null,
      totalDurationSec: row.total_duration_sec,
      screenerInserted: row.completion_status === "Completed",
    });
    if (!ok) {
      skipped += 1;
      continue;
    }
    have.add(row.lead_id);
    inserted += 1;
  }

  return { inserted, skipped };
}
