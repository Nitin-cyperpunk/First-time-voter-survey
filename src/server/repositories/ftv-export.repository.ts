import type { ExportRow } from "@/lib/export";
import {
  FTV_EXPORT_HEADERS,
  buildFtvCodebook,
  pivotFtvWideRows,
  type FtvAnswerRow,
  type FtvCodebookRow,
  type FtvRespondentRow,
} from "@/lib/ftv-export";
import { buildDuplicateExportFields } from "@/lib/respondents/duplicate-visibility";
import {
  recoverFtvAnswers,
  recoverFtvRespondent,
  type RecoveredParticipant,
  type RecoveredScreener,
} from "@/lib/ftv-export/recover";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { backfillMissingFtvFromScreener } from "@/server/repositories/ftv-responses.repository";

export type FtvFieldSummaryRow = {
  status: string;
  n: number;
  pct: number | string;
  "avg completion minutes": number | string;
};

export type FtvExportBundle = {
  headers: string[];
  rows: ExportRow[];
  codebook: FtvCodebookRow[];
  fieldSummary: FtvFieldSummaryRow[];
};

async function fetchAll<T>(
  loadPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const page = await loadPage(from, from + pageSize - 1);
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function loadMissingCompletedForExport(
  existing: FtvRespondentRow[],
  leadIdsFilter?: string[],
): Promise<{ respondents: FtvRespondentRow[]; answers: FtvAnswerRow[] }> {
  const have = new Set<string>();
  for (const row of existing) {
    if (row.lead_id) have.add(row.lead_id);
    if (row.respondent_id) have.add(row.respondent_id);
  }
  const filter = leadIdsFilter?.length ? new Set(leadIdsFilter) : null;

  const supabase = getSupabaseAdmin();
  const screeners = await fetchAll(async (from, to) => {
    const { data, error } = await supabase
      .from("screener_responses")
      .select(
        "lead_id, city_id, city_raw, city_match_type, answers, analytics, started_at, submitted_at, total_duration_sec",
      )
      .eq("completion_status", "Completed")
      .is("deleted_at", null)
      .order("submitted_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as RecoveredScreener[];
  });

  const missing = screeners.filter((row) => {
    if (!row.lead_id || have.has(row.lead_id)) return false;
    if (filter && !filter.has(row.lead_id)) return false;
    return true;
  });
  if (missing.length === 0) return { respondents: [], answers: [] };

  const missingIds = missing.map((row) => row.lead_id);
  const participants = await fetchAll(async (from, to) => {
    const { data, error } = await supabase
      .from("participants")
      .select(
        "lead_id, full_name, email, mobile, city, city_id, area, pincode, dob, created_at",
      )
      .in("lead_id", missingIds)
      .is("deleted_at", null)
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as RecoveredParticipant[];
  });
  const participantByLead = new Map(
    participants.map((row) => [row.lead_id, row]),
  );

  const respondents: FtvRespondentRow[] = [];
  const answers: FtvAnswerRow[] = [];
  for (const screener of missing) {
    const respondent = recoverFtvRespondent({
      screener,
      participant: participantByLead.get(screener.lead_id) ?? null,
    });
    respondents.push(respondent);
    if (respondent.respondent_id) {
      answers.push(...recoverFtvAnswers(respondent.respondent_id, screener));
    }
  }
  return { respondents, answers };
}

export async function listFtvExportBundle(
  leadIdsFilter?: string[],
  options?: { includeDeleted?: boolean },
): Promise<FtvExportBundle> {
  try {
    const recovered = await backfillMissingFtvFromScreener();
    if (recovered.inserted > 0) {
      console.info("[ftv-export] backfilled missing analysis rows", recovered);
    }
  } catch (error) {
    console.error("[ftv-export] backfill failed:", error);
  }

  const supabase = getSupabaseAdmin();

  const includeDeleted = options?.includeDeleted === true;
  const respondentTable = includeDeleted
    ? "ftv_respondents_all"
    : "ftv_respondents";

  let respondentQuery = supabase
    .from(respondentTable)
    .select("*")
    .order("created_at", { ascending: false });

  if (leadIdsFilter?.length) {
    respondentQuery = respondentQuery.or(
      `lead_id.in.(${leadIdsFilter.join(",")}),respondent_id.in.(${leadIdsFilter.join(",")})`,
    );
  }

  const { data: respondentRows, error: respondentError } = await respondentQuery;
  if (respondentError) throw respondentError;

  const respondents = (respondentRows ?? []) as FtvRespondentRow[];
  const overlay = await loadMissingCompletedForExport(respondents, leadIdsFilter);
  respondents.push(...overlay.respondents);
  const cityIds = [
    ...new Set(respondents.map((row) => row.city_id).filter(Boolean)),
  ] as string[];

  const cityById = new Map<string, { area_type: string; state: string; name: string }>();
  if (cityIds.length > 0) {
    const { data: cities, error: cityError } = await supabase
      .from("cities")
      .select("id, area_type, state, name")
      .in("id", cityIds);
    if (cityError) throw cityError;
    for (const city of cities ?? []) {
      cityById.set(city.id, {
        area_type: city.area_type,
        state: city.state,
        name: city.name,
      });
    }
  }

  const leadIds = respondents
    .map((row) => row.lead_id)
    .filter((id): id is string => Boolean(id));
  const screenerByLead = new Map<
    string,
    { city_raw: string | null; city_match_type: string | null }
  >();
  if (leadIds.length > 0) {
    const { data: screeners } = await supabase
      .from("screener_responses")
      .select("lead_id, city_raw, city_match_type")
      .in("lead_id", leadIds);
    for (const row of screeners ?? []) {
      screenerByLead.set(row.lead_id, {
        city_raw: row.city_raw,
        city_match_type: row.city_match_type,
      });
    }
  }

  const respondentsWithCity = respondents.map((row) => {
    const city = row.city_id ? cityById.get(row.city_id) : undefined;
    const areaType =
      city?.area_type === "local" || city?.area_type === "non_urban"
        ? "rural"
        : (city?.area_type ?? "");
    const screener = row.lead_id ? screenerByLead.get(row.lead_id) : undefined;
    return {
      ...row,
      city_raw: screener?.city_raw ?? row.city ?? "",
      city_resolved: city?.name ?? "",
      match_type: screener?.city_match_type ?? (row.city_id ? "exact" : "unmatched"),
      city_area_type: areaType,
      city_state: city?.state ?? "",
      quota_cell: city?.state && areaType ? `${city.state}|${areaType}` : "",
    };
  });

  const respondentIds = respondents
    .map((row) => row.respondent_id)
    .filter((id): id is string => Boolean(id));

  const answers: FtvAnswerRow[] = [];
  const idChunks: string[][] = [];
  for (let i = 0; i < respondentIds.length; i += 50) {
    idChunks.push(respondentIds.slice(i, i + 50));
  }

  for (const chunk of idChunks) {
    const page = await fetchAll(async (from, to) => {
      const { data, error } = await supabase
        .from(includeDeleted ? "ftv_answers_all" : "ftv_answers")
        .select("*")
        .in("respondent_id", chunk)
        .order("answer_order", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as FtvAnswerRow[];
    });
    answers.push(...page);
  }
  answers.push(...overlay.answers);

  const { data: summaryRows, error: summaryError } = await supabase
    .from("ftv_field_summary")
    .select("status, n, pct, avg_minutes");
  if (summaryError) throw summaryError;

  const fieldSummary: FtvFieldSummaryRow[] = (summaryRows ?? []).map((row) => ({
    status: row.status ?? "",
    n: row.n ?? 0,
    pct: row.pct ?? "",
    "avg completion minutes": row.avg_minutes ?? "",
  }));

  const wide = pivotFtvWideRows(respondentsWithCity, answers);

  const leadIdsForDuplicate = [
    ...new Set(
      wide
        .map((row) => String(row.lead_id ?? row.respondent_id ?? ""))
        .filter(Boolean),
    ),
  ];
  const duplicateByLead = new Map<
    string,
    ReturnType<typeof buildDuplicateExportFields>
  >();
  if (leadIdsForDuplicate.length > 0) {
    for (let i = 0; i < leadIdsForDuplicate.length; i += 200) {
      const chunk = leadIdsForDuplicate.slice(i, i + 200);
      const { data: participantRows, error: participantError } = await supabase
        .from("participants")
        .select(
          "lead_id, is_flagged_duplicate, duplicate_flag, original_participant_lead_id, duplicate_cluster_id, is_fingerprint_cluster_original, duplicate_gaming_pattern",
        )
        .in("lead_id", chunk)
        .is("deleted_at", null);
      if (participantError) throw participantError;
      for (const participant of participantRows ?? []) {
        duplicateByLead.set(
          participant.lead_id,
          buildDuplicateExportFields({
            isFlaggedDuplicate: Boolean(participant.is_flagged_duplicate),
            duplicateFlag: Boolean(participant.duplicate_flag),
            originalParticipantLeadId:
              participant.original_participant_lead_id ?? null,
            duplicateClusterId:
              (participant as Record<string, unknown>).duplicate_cluster_id as string | null ?? null,
            isFingerprintClusterOriginal:
              Boolean((participant as Record<string, unknown>).is_fingerprint_cluster_original),
            duplicateGamingPattern:
              (participant as Record<string, unknown>).duplicate_gaming_pattern as string | null ?? null,
          }),
        );
      }
    }
  }

  const wideWithDuplicate: ExportRow[] = wide.map((row) => {
    const leadId = String(row.lead_id ?? row.respondent_id ?? "");
    const duplicate =
      duplicateByLead.get(leadId) ??
      buildDuplicateExportFields({
        isFlaggedDuplicate: false,
        duplicateFlag: false,
        originalParticipantLeadId: null,
        duplicateClusterId: null,
        isFingerprintClusterOriginal: false,
        duplicateGamingPattern: null,
      });
    return {
      ...row,
      ...duplicate,
    };
  });

  const headers = includeDeleted
    ? [...FTV_EXPORT_HEADERS, "deleted_at"]
    : [...FTV_EXPORT_HEADERS];
  const deletedAtByLead = new Map<string, string>();
  if (includeDeleted) {
    for (const row of respondentsWithCity) {
      if (row.lead_id && row.deleted_at) {
        deletedAtByLead.set(row.lead_id, row.deleted_at);
      }
    }
  }
  const rows = includeDeleted
    ? wideWithDuplicate.map((row) => {
        const leadId = String(row.lead_id ?? row.respondent_id ?? "");
        return {
          ...row,
          deleted_at: deletedAtByLead.get(leadId) ?? "",
        };
      })
    : wideWithDuplicate;

  return {
    headers,
    rows,
    codebook: buildFtvCodebook(),
    fieldSummary,
  };
}
