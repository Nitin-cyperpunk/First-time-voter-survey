import { downloadCsv, downloadExcel } from "@/lib/export";
import { buildDuplicateExportFields } from "@/lib/respondents/duplicate-visibility";
import {
  computeEffectiveQcStatus,
  isQcStatusOverridden,
  QC_STATUS_LABELS,
} from "@/lib/respondents/qc-status";

export const PARTICIPANT_LIST_EXPORT_HEADERS = [
  "Lead_ID",
  "Name",
  "Mobile",
  "City",
  "Status",
  "Registered",
  "duplicate_flag",
  "duplicate_match_type",
  "duplicate_matched_lead_id",
  "duplicate_cluster_id",
  "is_fingerprint_cluster_original",
  "duplicate_gaming_pattern",
  "qc_status",
  "qc_overridden",
  "survey_data_incomplete",
  "qc_override_reason_latest",
  "qc_decided_by_latest",
  "qc_decided_at_latest",
] as const;

export function rowsToParticipantExport(
  rows: Array<{
    leadId: string;
    fullName: string;
    mobile: string;
    city?: string | null;
    status: string;
    createdAt: string;
    isFlaggedDuplicate?: boolean;
    duplicateFlag?: boolean;
    originalParticipantLeadId?: string | null;
    duplicateClusterId?: string | null;
    isFingerprintClusterOriginal?: boolean;
    duplicateGamingPattern?: string | null;
    qcStatusOverride?: "pass" | "fail" | "review" | null;
    surveyDataIncomplete?: boolean;
    qcOverrideReasonLatest?: string | null;
    qcDecidedByLatest?: string | null;
    qcDecidedAtLatest?: string | null;
  }>,
): Record<string, string | number>[] {
  return rows.map((row) => {
    const duplicate = buildDuplicateExportFields({
      isFlaggedDuplicate: Boolean(row.isFlaggedDuplicate),
      duplicateFlag: Boolean(row.duplicateFlag),
      originalParticipantLeadId: row.originalParticipantLeadId ?? null,
      duplicateClusterId: row.duplicateClusterId ?? null,
      isFingerprintClusterOriginal: row.isFingerprintClusterOriginal ?? false,
      duplicateGamingPattern: row.duplicateGamingPattern ?? null,
    });
    const effective = computeEffectiveQcStatus({
      status: row.status,
      duplicateFlag: Boolean(row.duplicateFlag),
      isFlaggedDuplicate: Boolean(row.isFlaggedDuplicate),
      qcStatusOverride: row.qcStatusOverride ?? null,
      surveyDataIncomplete: row.surveyDataIncomplete === true,
    });
    return {
      Lead_ID: row.leadId,
      Name: row.fullName,
      Mobile: row.mobile,
      City: row.city ?? "",
      Status: row.status,
      Registered: row.createdAt,
      duplicate_flag: duplicate.duplicate_flag,
      duplicate_match_type: duplicate.duplicate_match_type,
      duplicate_matched_lead_id: duplicate.duplicate_matched_lead_id,
      duplicate_cluster_id: duplicate.duplicate_cluster_id,
      is_fingerprint_cluster_original: duplicate.is_fingerprint_cluster_original,
      duplicate_gaming_pattern: duplicate.duplicate_gaming_pattern,
      qc_status: QC_STATUS_LABELS[effective],
      qc_overridden: isQcStatusOverridden({
        status: row.status,
        duplicateFlag: Boolean(row.duplicateFlag),
        isFlaggedDuplicate: Boolean(row.isFlaggedDuplicate),
        qcStatusOverride: row.qcStatusOverride ?? null,
        surveyDataIncomplete: row.surveyDataIncomplete === true,
      })
        ? "Yes"
        : "",
      survey_data_incomplete: row.surveyDataIncomplete ? "Yes" : "",
      qc_override_reason_latest: row.qcOverrideReasonLatest ?? "",
      qc_decided_by_latest: row.qcDecidedByLatest ?? "",
      qc_decided_at_latest: row.qcDecidedAtLatest ?? "",
    };
  });
}

export function exportParticipantRows(
  rows: Record<string, string | number>[],
  filename: string,
) {
  downloadCsv(filename, rows, [...PARTICIPANT_LIST_EXPORT_HEADERS]);
}

export function exportParticipantList(
  rows: Parameters<typeof rowsToParticipantExport>[0],
  format: "csv" | "excel",
  filenameBase: string,
) {
  const exportRows = rowsToParticipantExport(rows);
  const headers = [...PARTICIPANT_LIST_EXPORT_HEADERS];
  if (format === "csv") {
    downloadCsv(`${filenameBase}.csv`, exportRows, headers);
    return;
  }
  downloadExcel(`${filenameBase}.xlsx`, "Respondents", exportRows, headers);
}
