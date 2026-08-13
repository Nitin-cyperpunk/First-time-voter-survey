import { downloadCsv, downloadExcel } from "@/lib/export";

export async function exportRowsAsCsv(
  filename: string,
  rows: Record<string, string | number>[],
) {
  downloadCsv(filename, rows);
}

export async function exportRowsAsExcel(
  filename: string,
  sheetName: string,
  rows: Record<string, string | number>[],
) {
  downloadExcel(filename, sheetName, rows);
}

export function filterExportRowsByLeadIds(
  rows: Record<string, string | number>[],
  leadIds: Set<string>,
  leadIdHeader = "Lead_ID",
): Record<string, string | number>[] {
  return rows.filter((row) => {
    const leadId = String(row[leadIdHeader] ?? "");
    return leadIds.has(leadId);
  });
}
