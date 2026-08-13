import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import {
  mapUniqueViolationToSubmissionError,
  SubmissionError,
} from "@/lib/db-errors";

export async function hasSurveyResponse(leadId: string) {
  const { count, error } = await getSupabaseAdmin()
    .from("survey_responses")
    .select("*", { count: "exact", head: true })
    .eq("lead_id", leadId);

  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function createSurveyResponse(input: {
  leadId: string;
  formVersion?: number | null;
  answers: Json;
  responseTimes?: Json | null;
  analytics?: Json | null;
  normalizedExport?: Json | null;
  startedAt?: Date | null;
  submittedAt?: Date | null;
  totalDurationSec?: number | null;
}) {
  const { data, error } = await getSupabaseAdmin()
    .from("survey_responses")
    .insert({
      lead_id: input.leadId,
      form_version: input.formVersion ?? null,
      answers: input.answers,
      response_times: input.responseTimes ?? null,
      analytics: input.analytics ?? null,
      normalized_export: input.normalizedExport ?? null,
      started_at: input.startedAt?.toISOString() ?? null,
      submitted_at: input.submittedAt?.toISOString() ?? new Date().toISOString(),
      total_duration_sec: input.totalDurationSec ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("createSurveyResponse insert failed:", {
      leadId: input.leadId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    const mapped = mapUniqueViolationToSubmissionError(error, "DUPLICATE_SURVEY");
    if (mapped) throw mapped;
    throw error;
  }

  return data;
}

export async function findSurveyResponseByLeadId(leadId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("survey_responses")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function assertSurveyNotSubmitted(alreadySubmitted: boolean) {
  if (alreadySubmitted) {
    throw new SubmissionError(
      "DUPLICATE_SURVEY",
      "Our records show this survey has already been completed.",
    );
  }
}
