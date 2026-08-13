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
  const { data, error } = await getSupabaseAdmin().rpc("insert_ftv_response", {
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
    p_referral_code: input.referralCode ?? null,
  });

  if (error) {
    return { ok: false, code: "rpc_error", error: error.message };
  }

  const payload = data as { ok?: boolean; code?: string; error?: string } | null;
  if (!payload?.ok) {
    return {
      ok: false,
      code: payload?.code ?? "ftv_insert_failed",
      error: payload?.error,
    };
  }

  return { ok: true };
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
  cityId: string;
  startedAt?: Date | null;
  submittedAt?: Date | null;
  totalDurationSec?: number | null;
  screenerInserted: boolean;
  referralCode?: string | null;
}): Promise<void> {
  const answerJson = input.answerJson;
  if (!answerJson || Object.keys(answerJson).length === 0) return;

  const status = resolveFtvStatus({
    payloadStatus: readFtvPayloadString(answerJson, "status"),
    terminated: input.terminated,
    terminations: input.terminations,
  });
  if (!status) return;
  if (status === "COMPLETE" && !input.screenerInserted) return;

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
  if (result.ok) return;
  if (result.code === "duplicate_respondent_id") return;
  console.error("[persistFtvAnalysisResponse] insert failed:", result);
}
