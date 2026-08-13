import { formatExportDate } from "@/lib/survey-export";
import {
  EVERYDAY_BRA_WIDE_HEADERS,
  mapEverydayBraAnswersToWideRow,
  type EverydayBraWideMeta,
} from "@/lib/survey-export/everyday-bra-wide";
import {
  extractQuestionAnswers,
  normalizeSurveyResponseDocument,
} from "@/lib/survey-response-document";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ExportRow } from "@/lib/export";

function resolveSurveyStatus(answers: Record<string, unknown>): EverydayBraWideMeta["status"] {
  const consent = String(
    answers.consent ?? answers.Consent ?? "",
  ).trim().toLowerCase();
  if (consent === "no") return "consent_declined";
  return "complete";
}

function durationMinutesFromSec(totalDurationSec: number | null | undefined): string {
  if (totalDurationSec === null || totalDurationSec === undefined) return "";
  const minutes = totalDurationSec / 60;
  return Number.isFinite(minutes) ? (Math.round(minutes * 10) / 10).toString() : "";
}

/**
 * Rebuild row in sample column order (Postgres jsonb does not preserve key order)
 * and refresh Started/Completed/Duration from DB timestamps in sample date format.
 */
function finalizeWideExportRow(
  row: Record<string, string | number>,
  meta: {
    startedAt: string | null;
    submittedAt: string | null;
    totalDurationSec: number | null;
  },
): ExportRow {
  const ordered: ExportRow = {};
  for (const header of EVERYDAY_BRA_WIDE_HEADERS) {
    ordered[header] = row[header] ?? "";
  }
  ordered["Started at"] = meta.startedAt ? formatExportDate(meta.startedAt) : "";
  ordered["Completed at"] = meta.submittedAt
    ? formatExportDate(meta.submittedAt)
    : "";
  ordered["Duration (minutes)"] = durationMinutesFromSec(meta.totalDurationSec);
  return ordered;
}

function flatAnswersFromDocument(raw: unknown): Record<string, unknown> {
  const document = normalizeSurveyResponseDocument(raw ?? {});
  const extracted = extractQuestionAnswers(document);
  // Prefer full answers object (keeps runtime field names like q8_0).
  const fromDoc =
    document.answers && typeof document.answers === "object"
      ? (document.answers as Record<string, unknown>)
      : {};
  return { ...fromDoc, ...extracted };
}

/**
 * Survey Excel/CSV rows in the authoritative Everyday Bra wide format (1171 cols).
 * Always remaps from stored answers so nested size (Q35) and sample dates stay correct.
 */
export async function listSurveyExportRows(options?: {
  includeDiagnostics?: boolean;
  leadIds?: string[];
}): Promise<ExportRow[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("survey_responses")
    .select(
      "lead_id, answers, response_times, total_duration_sec, form_version, started_at, submitted_at, normalized_export",
    )
    .order("submitted_at", { ascending: false });

  if (options?.leadIds?.length) {
    query = query.in("lead_id", options.leadIds);
  }

  const { data: surveyRows, error: surveyError } = await query;
  if (surveyError) throw surveyError;
  if (!surveyRows?.length) return [];

  return surveyRows.map((row) => {
    const timeMeta = {
      startedAt: row.started_at ?? null,
      submittedAt: row.submitted_at ?? null,
      totalDurationSec: row.total_duration_sec ?? null,
    };

    // Always remap from stored answers. Persisted normalized_export can be stale
    // (e.g. empty Q28 when size was nested as Q35: [band, cup, full]).
    const document = normalizeSurveyResponseDocument(row.answers ?? {}, {
      legacyResponseTimes: row.response_times,
    });
    const flatAnswers = flatAnswersFromDocument(row.answers);
    const formVersionNumber = row.form_version ?? 0;
    const surveyVersion =
      document.survey_version ||
      (formVersionNumber > 0 ? `v${formVersionNumber}` : "");

    const fresh = mapEverydayBraAnswersToWideRow(flatAnswers, {
      leadId: row.lead_id,
      status: resolveSurveyStatus(flatAnswers),
      surveyVersion,
      startedAt: row.started_at ? formatExportDate(row.started_at) : "",
      completedAt: row.submitted_at
        ? formatExportDate(row.submitted_at)
        : "",
      durationMinutes: durationMinutesFromSec(row.total_duration_sec),
      lastScreenReached:
        document._last_screen || document.current_screen || "",
      q16q17TabOrder: String(
        flatAnswers.q16q17_tab_order ??
          flatAnswers.stmt_tab_order ??
          "",
      ),
      q22TabOrder: String(
        flatAnswers.q22_tab_order ?? flatAnswers.wtp_tab_order ?? "",
      ),
    });

    return finalizeWideExportRow(fresh, timeMeta);
  });
}
