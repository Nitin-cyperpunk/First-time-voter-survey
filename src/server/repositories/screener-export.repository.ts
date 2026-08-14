import {
  buildExportRow,
  buildResponseExportArtifacts,
  coerceFormExportSchema,
} from "@/lib/form-export";
import type { FormExportRow } from "@/lib/form-export/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  loadSchemasForVersions,
  mergeSchemasFromMap,
  resolveSchemaForFormVersion,
  getPublishedFormVersion,
} from "@/server/services/form-export.service";

function isNonEmptyCsvRow(
  value: unknown,
): value is Record<string, string | number> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length > 0
  );
}

function overlayStoredCsvRow(
  rebuilt: FormExportRow,
  stored: Record<string, string | number>,
): FormExportRow {
  const next: FormExportRow = { ...rebuilt };

  for (const [header, current] of Object.entries(rebuilt)) {
    if (current !== "" && current !== undefined && current !== null) {
      continue;
    }

    const exact = stored[header];
    if (exact !== undefined && exact !== null && exact !== "") {
      next[header] = exact;
    }
  }

  return next;
}

export async function listScreenerExportRows(leadIdsFilter?: string[]) {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("screener_responses")
    .select(
      "lead_id, answers, response_times, total_duration_sec, form_version, csv_row",
    )
    .is("deleted_at", null)
    .order("submitted_at", { ascending: false });

  if (leadIdsFilter?.length) {
    query = query.in("lead_id", leadIdsFilter);
  }

  const { data: screenerRows, error: screenerError } = await query;

  if (screenerError) throw screenerError;
  if (!screenerRows?.length) return [];

  const leadIds = screenerRows.map((row) => row.lead_id);
  const { data: participantRows, error: participantError } = await supabase
    .from("participants")
    .select("lead_id, full_name, mobile, city")
    .in("lead_id", leadIds);

  if (participantError) throw participantError;

  const participantByLeadId = new Map(
    (participantRows ?? []).map((row) => [row.lead_id, row]),
  );

  const schemaByVersion = await loadSchemasForVersions(
    "registration",
    screenerRows.map((row) => row.form_version),
  );
  const exportSchema = mergeSchemasFromMap(schemaByVersion);

  return Promise.all(
    screenerRows.map(async (row) => {
      const participant = participantByLeadId.get(row.lead_id);
      const answers = (row.answers ?? {}) as Record<string, unknown>;
      const schema =
        schemaByVersion.get(row.form_version) ??
        coerceFormExportSchema(null);
      const formVersion = await getPublishedFormVersion(
        "registration",
        row.form_version,
      );

      const metadata = {
        full_name: participant?.full_name ?? "",
        mobile: participant?.mobile ?? "",
        city: participant?.city ?? "",
        Total_Duration:
          row.total_duration_sec !== null && row.total_duration_sec !== undefined
            ? row.total_duration_sec
            : "",
      };

      const { normalizedExport } = buildResponseExportArtifacts({
        schema,
        html: formVersion?.html_content,
        answers,
        leadId: row.lead_id,
        metadata,
        excludeCoreFields: true,
        respondentIdHeader: "Respondent ID",
      });

      const rebuilt = buildExportRow({
        leadId: row.lead_id,
        schema: exportSchema.fields.length > 0 ? exportSchema : schema,
        normalized: normalizedExport,
        metadata,
        respondentIdHeader: "Respondent ID",
      });

      if (isNonEmptyCsvRow(row.csv_row)) {
        return overlayStoredCsvRow(
          rebuilt,
          row.csv_row as Record<string, string | number>,
        );
      }

      return rebuilt;
    }),
  );
}

function parseResponseTimes(
  value: unknown,
): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "number" && Number.isInteger(raw)) {
      parsed[key] = raw;
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

export { parseResponseTimes, resolveSchemaForFormVersion };
