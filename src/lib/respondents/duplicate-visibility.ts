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

/** Payout-tab labels: a flag for review, not an accusation. */
export type PayoutDuplicateFilter = "all" | "flagged" | "clean";

export const PAYOUT_DUPLICATE_FILTER_OPTIONS: Array<{
  value: PayoutDuplicateFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "flagged", label: "Flagged" },
  { value: "clean", label: "Clean" },
];

export function payoutDuplicateFilterLabel(
  filter: PayoutDuplicateFilter,
): string {
  return (
    PAYOUT_DUPLICATE_FILTER_OPTIONS.find((option) => option.value === filter)
      ?.label ?? "All"
  );
}

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

/**
 * Payout duplicate filter. NULL/false on both signals is Clean — older rows
 * that predate fingerprinting must not fall through Flagged and Clean.
 */
export function matchesPayoutDuplicateFilter(
  row: DuplicateSignals,
  filter: PayoutDuplicateFilter,
): boolean {
  if (filter === "all") return true;
  const flagged = isAnyDuplicate(row);
  if (filter === "flagged") return flagged;
  return !flagged;
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
