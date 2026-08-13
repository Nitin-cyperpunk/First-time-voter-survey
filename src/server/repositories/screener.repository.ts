import {
  CapacityError,
  extractSelfReportedAreaType,
  isCapacityRejectCode,
} from "@/lib/capacity";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { getActivePublishedForm } from "@/server/repositories/forms.repository";
import type { ScreenerSchema } from "@/types/domain";
import {
  mapUniqueViolationToSubmissionError,
  SubmissionError,
} from "@/lib/db-errors";
import { isQKey } from "@/lib/response-storage";

export async function hasScreenerResponse(leadId: string) {
  const { count, error } = await getSupabaseAdmin()
    .from("screener_responses")
    .select("*", { count: "exact", head: true })
    .eq("lead_id", leadId);

  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function createResponse(input: {
  leadId: string;
  mobile?: string | null;
  formVersion: number;
  answers: Json;
  completionStatus: "Completed" | "Terminated";
  terminationReason?: string | null;
  responseTimes?: Json | null;
  analytics?: Json | null;
  csvRow?: Json | null;
  normalizedExport?: Json | null;
  startedAt?: Date | null;
  submittedAt?: Date | null;
  totalDurationSec?: number | null;
  ipAddress?: string | null;
  cityId: string;
  selfReportedAreaType?: string | null;
}) {
  /**
   * Capacity check + INSERT run inside insert_screener_response_with_capacity.
   * Postgres holds pg_advisory_xact_lock('concave_screener_capacity') until
   * commit, so concurrent submits at count 199 cannot both pass the cap.
   * Do not replace this RPC with a JS select-count-then-insert.
   */
  const answersRecord =
    input.answers && typeof input.answers === "object" && !Array.isArray(input.answers)
      ? (input.answers as Record<string, unknown>)
      : {};
  const selfReported =
    input.selfReportedAreaType ?? extractSelfReportedAreaType(answersRecord);

  const { data, error } = await getSupabaseAdmin().rpc(
    "insert_screener_response_with_capacity",
    {
      p_lead_id: input.leadId,
      p_mobile: input.mobile?.trim() || null,
      p_form_version: input.formVersion,
      p_answers: input.answers,
      p_completion_status: input.completionStatus,
      p_termination_reason: input.terminationReason ?? null,
      p_response_times: input.responseTimes ?? null,
      p_analytics: input.analytics ?? null,
      p_csv_row: input.csvRow ?? null,
      p_normalized_export: input.normalizedExport ?? null,
      p_started_at: input.startedAt?.toISOString() ?? null,
      p_submitted_at: input.submittedAt?.toISOString() ?? new Date().toISOString(),
      p_total_duration_sec: input.totalDurationSec ?? null,
      p_ip_address: input.ipAddress ?? null,
      p_city_id: input.cityId,
      p_self_reported_area_type: selfReported,
    },
  );

  if (error) {
    const mapped = mapUniqueViolationToSubmissionError(error, "DUPLICATE_SCREENER");
    if (mapped) throw mapped;
    throw error;
  }

  const payload = data as { ok?: boolean; code?: string; row?: unknown } | null;
  if (!payload?.ok) {
    const code = payload?.code;
    if (isCapacityRejectCode(code)) throw new CapacityError(code);
    throw new Error(code ? `CAPACITY_REJECT:${code}` : "CAPACITY_REJECT");
  }

  return payload.row;
}

export function assertScreenerNotSubmitted(alreadySubmitted: boolean) {
  if (alreadySubmitted) {
    throw new SubmissionError(
      "DUPLICATE_SCREENER",
      "You have already submitted this form.",
    );
  }
}

export async function getScreenerResponse(leadId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("screener_responses")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteScreenerResponse(leadId: string) {
  const { error } = await getSupabaseAdmin()
    .from("screener_responses")
    .delete()
    .eq("lead_id", leadId);

  if (error) throw error;
}

export async function updateResponse(
  leadId: string,
  input: {
    mobile: string;
    formVersion: number;
    answers: Json;
    completionStatus: "Completed" | "Terminated";
    terminationReason?: string | null;
    responseTimes?: Json | null;
    analytics?: Json | null;
    csvRow?: Json | null;
    normalizedExport?: Json | null;
    startedAt?: Date | null;
    submittedAt?: Date | null;
    totalDurationSec?: number | null;
    ipAddress?: string | null;
    cityId?: string | null;
    configAreaType?: "urban" | "local" | null;
  },
) {
  const answersRecord =
    input.answers && typeof input.answers === "object" && !Array.isArray(input.answers)
      ? (input.answers as Record<string, unknown>)
      : {};
  const selfReported = extractSelfReportedAreaType(answersRecord);

  const { data, error } = await getSupabaseAdmin()
    .from("screener_responses")
    .update({
      mobile: input.mobile,
      form_version: input.formVersion,
      answers: input.answers,
      completion_status: input.completionStatus,
      termination_reason: input.terminationReason ?? null,
      response_times: input.responseTimes ?? null,
      analytics: input.analytics ?? null,
      csv_row: input.csvRow ?? null,
      normalized_export: input.normalizedExport ?? null,
      started_at: input.startedAt?.toISOString() ?? null,
      submitted_at: input.submittedAt?.toISOString() ?? new Date().toISOString(),
      total_duration_sec: input.totalDurationSec ?? null,
      ip_address: input.ipAddress ?? null,
      ...(input.cityId !== undefined ? { city_id: input.cityId } : {}),
      ...(input.configAreaType !== undefined
        ? { config_area_type: input.configAreaType }
        : {}),
      self_reported_area_type: selfReported,
    })
    .eq("lead_id", leadId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export function buildCsvRow(
  participant: { fullName: string; mobile: string; city: string | null },
  answers: Record<string, string>,
  schema: ScreenerSchema,
  options?: {
    responseTimes?: Record<string, number> | null;
    totalDurationSec?: number | null;
  },
) {
  const row: Record<string, string | number> = {
    full_name: participant.fullName,
    mobile: participant.mobile,
    city: participant.city ?? "",
  };

  if (schema.fields.length > 0) {
    schema.fields.forEach((field, index) => {
      const qKey = isQKey(field.id) ? field.id : `Q${index + 1}`;
      row[qKey] = answers[qKey] ?? answers[field.id] ?? "";
      const time = options?.responseTimes?.[qKey] ?? options?.responseTimes?.[field.id];
      if (time !== undefined) {
        row[`${qKey}_Time`] = time;
      }
    });
  } else {
    for (const [key, value] of Object.entries(answers)) {
      row[key] = value;
      const time = options?.responseTimes?.[key];
      if (time !== undefined) {
        row[`${key}_Time`] = time;
      }
    }
  }

  if (options?.totalDurationSec !== null && options?.totalDurationSec !== undefined) {
    row.Total_Duration = options.totalDurationSec;
  }

  return row;
}

export async function getActiveFormVersion() {
  return getActivePublishedForm("registration");
}
