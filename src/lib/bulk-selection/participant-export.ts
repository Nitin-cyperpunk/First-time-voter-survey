import { downloadCsv } from "@/lib/export";
import { buildDuplicateExportFields } from "@/lib/respondents/duplicate-visibility";

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
  }>,
): Record<string, string | number>[] {
  return rows.map((row) => {
    const duplicate = buildDuplicateExportFields({
      isFlaggedDuplicate: Boolean(row.isFlaggedDuplicate),
      duplicateFlag: Boolean(row.duplicateFlag),
      originalParticipantLeadId: row.originalParticipantLeadId ?? null,
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
    };
  });
}

export function exportParticipantRows(
  rows: Record<string, string | number>[],
  filename: string,
) {
  downloadCsv(filename, rows);
}
