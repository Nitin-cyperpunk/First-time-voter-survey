import type { ExportRow } from "@/lib/export";
import {
  FTV_EXPORT_HEADERS,
  buildFtvCodebook,
  pivotFtvWideRows,
  type FtvAnswerRow,
  type FtvCodebookRow,
  type FtvRespondentRow,
} from "@/lib/ftv-export";
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

export async function listFtvExportBundle(
  leadIdsFilter?: string[],
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

  let respondentQuery = supabase
    .from("ftv_respondents")
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
  const cityIds = [
    ...new Set(respondents.map((row) => row.city_id).filter(Boolean)),
  ] as string[];

  const cityAreaById = new Map<string, string>();
  if (cityIds.length > 0) {
    const { data: cities, error: cityError } = await supabase
      .from("cities")
      .select("id, area_type")
      .in("id", cityIds);
    if (cityError) throw cityError;
    for (const city of cities ?? []) {
      cityAreaById.set(city.id, city.area_type);
    }
  }

  const respondentsWithCity = respondents.map((row) => ({
    ...row,
    city_area_type: row.city_id ? (cityAreaById.get(row.city_id) ?? "") : "",
  }));

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
        .from("ftv_answers")
        .select("*")
        .in("respondent_id", chunk)
        .order("answer_order", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as FtvAnswerRow[];
    });
    answers.push(...page);
  }

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

  return {
    headers: [...FTV_EXPORT_HEADERS],
    rows: pivotFtvWideRows(respondentsWithCity, answers),
    codebook: buildFtvCodebook(),
    fieldSummary,
  };
}
