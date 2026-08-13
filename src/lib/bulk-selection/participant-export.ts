import { downloadCsv } from "@/lib/export";

export function rowsToParticipantExport(
  rows: Array<{
    leadId: string;
    fullName: string;
    mobile: string;
    city?: string | null;
    instagramId?: string | null;
    status: string;
    createdAt: string;
  }>,
): Record<string, string | number>[] {
  return rows.map((row) => ({
    Lead_ID: row.leadId,
    Name: row.fullName,
    Mobile: row.mobile,
    City: row.city ?? "",
    Instagram_ID: row.instagramId ?? "",
    Status: row.status,
    Registered: row.createdAt,
  }));
}

export function exportParticipantRows(
  rows: Record<string, string | number>[],
  filename: string,
) {
  downloadCsv(filename, rows);
}
