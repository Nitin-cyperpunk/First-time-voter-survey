import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { getActivePublishedForm } from "@/server/repositories/forms.repository";
import type { ScreenerSchema } from "@/types/domain";
import {
  mapUniqueViolationToSubmissionError,
  SubmissionError,
} from "@/lib/db-errors";

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
}) {
  const { data, error } = await getSupabaseAdmin()
    .from("screener_responses")
    .insert({
      lead_id: input.leadId,
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
    })
    .select("*")
    .single();

  if (error) {
    const mapped = mapUniqueViolationToSubmissionError(error, "DUPLICATE_SCREENER");
    if (mapped) throw mapped;
    throw error;
  }
  return data;
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
  },
) {
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
      const qKey = /^Q\d+$/.test(field.id) ? field.id : `Q${index + 1}`;
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
