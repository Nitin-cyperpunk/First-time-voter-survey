export type DuplicateMatchType = "none" | "ip" | "fingerprint" | "both";

export type DuplicateFilter = "all" | "duplicates" | "non_duplicates";

export const DUPLICATE_FILTER_OPTIONS: Array<{
  value: DuplicateFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "duplicates", label: "Duplicates" },
  { value: "non_duplicates", label: "Non-Duplicates" },
];

export const DUPLICATE_MATCH_LABELS: Record<DuplicateMatchType, string> = {
  none: "No",
  ip: "IP",
  fingerprint: "Fingerprint",
  both: "Both",
};

export type DuplicateSignals = {
  isFlaggedDuplicate: boolean;
  duplicateFlag: boolean;
  /** First-seen / source lead this row duplicates (same field as detail “First seen”). */
  originalParticipantLeadId?: string | null;
};

export function deriveDuplicateMatchType(
  row: DuplicateSignals,
): DuplicateMatchType {
  const ip = row.isFlaggedDuplicate;
  const fingerprint = row.duplicateFlag;
  if (ip && fingerprint) return "both";
  if (ip) return "ip";
  if (fingerprint) return "fingerprint";
  return "none";
}

export function isAnyDuplicate(row: DuplicateSignals): boolean {
  return deriveDuplicateMatchType(row) !== "none";
}

export function matchesDuplicateFilter(
  row: DuplicateSignals,
  filter: DuplicateFilter,
): boolean {
  if (filter === "all") return true;
  const duplicate = isAnyDuplicate(row);
  if (filter === "duplicates") return duplicate;
  return !duplicate;
}

export function formatDuplicateStatusLabel(row: DuplicateSignals): string {
  const matchType = deriveDuplicateMatchType(row);
  if (matchType === "none") return "No";
  return `Yes (${DUPLICATE_MATCH_LABELS[matchType]})`;
}

/** Human-readable match type for spreadsheets (empty when not a duplicate). */
export function formatDuplicateMatchTypeExport(
  row: DuplicateSignals,
): string {
  const matchType = deriveDuplicateMatchType(row);
  if (matchType === "none") return "";
  if (matchType === "both") return "Fingerprint + IP";
  if (matchType === "ip") return "IP";
  return "Fingerprint";
}

export function formatDuplicateFlagExport(row: DuplicateSignals): string {
  return isAnyDuplicate(row) ? "Yes" : "";
}

export type DuplicateExportFields = {
  duplicate_flag: string;
  duplicate_match_type: string;
  duplicate_matched_lead_id: string;
};

export function buildDuplicateExportFields(
  row: DuplicateSignals,
): DuplicateExportFields {
  const matched = row.originalParticipantLeadId?.trim() ?? "";
  return {
    duplicate_flag: formatDuplicateFlagExport(row),
    duplicate_match_type: formatDuplicateMatchTypeExport(row),
    duplicate_matched_lead_id: isAnyDuplicate(row) ? matched : "",
  };
}
