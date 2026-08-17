import { downloadCsv, downloadExcel, type ExportRow } from "@/lib/export";

export const REFERRAL_EXPORT_HEADERS = [
  "Referrer name",
  "Referrer mobile",
  "Referred name",
  "Referred mobile",
  "Reward status",
  "Pending reason",
  "Amount",
  "Created date",
] as const;

export type ReferralExportSource = {
  referrerName: string;
  referrerMobile: string;
  referredName: string;
  referredMobile: string;
  rewardStatus: string;
  pendingReason: string | null;
  rewardAmount: number | null;
  createdAt: Date | string;
};

function cell(value: string | number | null | undefined): string | number {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (value === "—" || value === "None" || value === "undefined") return "";
  return value;
}

function formatCreated(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function rowsToReferralExport(
  rows: ReferralExportSource[],
): ExportRow[] {
  return rows.map((row) => ({
    "Referrer name": cell(row.referrerName),
    "Referrer mobile": cell(row.referrerMobile),
    "Referred name": cell(row.referredName),
    "Referred mobile": cell(row.referredMobile),
    "Reward status": cell(row.rewardStatus),
    "Pending reason":
      row.rewardStatus.toLowerCase() === "pending"
        ? cell(row.pendingReason)
        : "",
    Amount:
      row.rewardAmount == null || !Number.isFinite(Number(row.rewardAmount))
        ? ""
        : Number(row.rewardAmount),
    "Created date": formatCreated(row.createdAt),
  }));
}

export function exportReferralRows(
  rows: ReferralExportSource[],
  format: "csv" | "excel",
  filenameBase = "referrals",
) {
  const exportRows = rowsToReferralExport(rows);
  const headers = [...REFERRAL_EXPORT_HEADERS];
  if (format === "csv") {
    downloadCsv(`${filenameBase}.csv`, exportRows, headers);
    return;
  }
  downloadExcel(`${filenameBase}.xlsx`, "Referrals", exportRows, headers);
}
