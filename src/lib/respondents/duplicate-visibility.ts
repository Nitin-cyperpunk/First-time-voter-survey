// ─── Operative rule (single canonical location) ──────────────────────────────
//
// FINGERPRINT match (including "both"):
//   duplicate_flag=true → INELIGIBLE on both sides of any pair or cluster.
//   Excluded from "clean". No referral reward. No survey payout.
//   Rationale: a device fingerprint identifies the same physical device with
//   high confidence. Matching fingerprints are strong evidence of the same person.
//
// IP-ONLY match:
//   is_flagged_duplicate=true, duplicate_flag=false → REVIEW only.
//   Still counted as "clean". Still payable.
//   Rationale: CGNAT in India means hundreds of mobile users share one public
//   IP address, and household members share a home connection. Withholding
//   money on IP alone would penalise a large number of genuine respondents.
//   Changing this requires an explicit product decision.
//
// These are two separately queryable states, not one shared flag.
// This file is the single authoritative definition. Import from here everywhere.
// ─────────────────────────────────────────────────────────────────────────────

import {
  isQualifiedCompletionStatus,
  normalizeParticipantStatus,
} from "@/lib/participant-lifecycle";

export type DuplicateMatchType = "none" | "ip" | "fingerprint" | "both";

export type DuplicateFilter =
  | "all"
  | "duplicates"
  | "non_duplicates"
  | "ip_review"
  | "fingerprint";

export const DUPLICATE_FILTER_OPTIONS: Array<{
  value: DuplicateFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "non_duplicates", label: "Clean" },
  { value: "fingerprint", label: "Fingerprint" },
  { value: "ip_review", label: "IP review" },
  { value: "duplicates", label: "Any flag" },
];

/** Payout-tab labels. "Flagged" = either signal. "Clean" = no fingerprint flag. */
export type PayoutDuplicateFilter = "all" | "flagged" | "clean" | "ip_review";

export const PAYOUT_DUPLICATE_FILTER_OPTIONS: Array<{
  value: PayoutDuplicateFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "flagged", label: "Flagged" },
  { value: "clean", label: "Clean" },
  { value: "ip_review", label: "IP review" },
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
  isFlaggedDuplicate: boolean;  // is_flagged_duplicate: IP-based flag
  duplicateFlag: boolean;       // duplicate_flag: fingerprint-based flag
  /** Lead ID of the earliest record in this cluster (set on non-original members). */
  originalParticipantLeadId?: string | null;
  /** Shared cluster UUID, present on all members after migration 025. */
  duplicateClusterId?: string | null;
  /** True if this record is the chronologically first in its cluster. */
  isFingerprintClusterOriginal?: boolean;
  /** 'screener_evasion' when earlier entry was terminated and this one completed. */
  duplicateGamingPattern?: string | null;
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

/** True if the record has ANY duplicate signal (IP or fingerprint). */
export function isAnyDuplicate(row: DuplicateSignals): boolean {
  return deriveDuplicateMatchType(row) !== "none";
}

/**
 * True if this record has a FINGERPRINT duplicate flag (duplicate_flag=true).
 * This is the ineligibility signal — both the original and later members of a
 * fingerprint cluster have this set.
 * IP-only records return false — they are still clean and payable.
 */
export function isFingerprintFlagged(row: DuplicateSignals): boolean {
  return row.duplicateFlag === true;
}

/**
 * Whether a record is "clean" for payout and reward purposes.
 *
 * CLEAN  = duplicate_flag is false (fingerprint is absent on this record).
 *          IP-only records (is_flagged_duplicate=true, duplicate_flag=false)
 *          ARE clean — see operative rule above.
 *
 * NOT CLEAN = duplicate_flag is true (fingerprint match, either side of pair).
 *
 * This is the single definition of "clean". Use it everywhere — filter, payout
 * query, reward eligibility, export.
 */
export function isCleanForPayout(row: DuplicateSignals): boolean {
  return !isFingerprintFlagged(row);
}

export type DeliverableRow = DuplicateSignals & { status: string };

/** Admin QC pass or downstream successful / paid (override counts as clean). */
export function isQcEffectivePass(status: string): boolean {
  const normalized = normalizeParticipantStatus(status);
  return (
    normalized === "review_pass" ||
    normalized === "successful" ||
    normalized === "paid"
  );
}

/** Admin QC fail or downstream unsuccessful. */
export function isQcEffectiveFail(status: string): boolean {
  const normalized = normalizeParticipantStatus(status);
  return normalized === "review_fail" || normalized === "unsuccessful";
}

/**
 * Deliverable clean count — single definition for dashboard, filters, payout, export.
 *
 * Includes qualified completions that pass the fingerprint clean rule (isCleanForPayout).
 * IP-only flags remain included. Terminated and pre-complete statuses are excluded.
 * QC-failed rows are excluded; awaiting QC (status=completed) counts until failed.
 * Admin Pass → successful/review_pass/paid stays clean.
 */
export function isDeliverableClean(row: DeliverableRow): boolean {
  if (!isQualifiedCompletionStatus(row.status)) return false;
  if (!isCleanForPayout(row)) return false;
  if (isQcEffectiveFail(row.status)) return false;
  return true;
}

/** @deprecated Use surveyPayoutAmount from qc-status with effective QC. */
export function surveyEarningsAmount(
  row: DeliverableRow,
  surveyRewardAmount: number,
): number {
  return isDeliverableClean(row) ? surveyRewardAmount : 0;
}

/** Map DB / API snake_case participant fields to DeliverableRow signals. */
export function toDeliverableRow(participant: {
  status: string;
  duplicate_flag?: boolean | null;
  is_flagged_duplicate?: boolean | null;
}): DeliverableRow {
  return {
    status: participant.status,
    duplicateFlag: participant.duplicate_flag === true,
    isFlaggedDuplicate: participant.is_flagged_duplicate === true,
  };
}

/** IP-only review flag: shared IP, no fingerprint match on this record. */
export function isIpReviewOnly(row: DuplicateSignals): boolean {
  return row.isFlaggedDuplicate === true && !isFingerprintFlagged(row);
}

export function matchesDuplicateFilter(
  row: DuplicateSignals,
  filter: DuplicateFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "non_duplicates") return isCleanForPayout(row);
  if (filter === "fingerprint") return isFingerprintFlagged(row);
  if (filter === "ip_review") return isIpReviewOnly(row);
  if (filter === "duplicates") return isAnyDuplicate(row);
  return true;
}

/**
 * Payout duplicate filter.
 *
 * "clean"   → isCleanForPayout(row): no fingerprint flag. IP-only stays clean.
 * "flagged" → isAnyDuplicate(row): either IP or fingerprint signal present.
 * "all"     → always true.
 *
 * NULL/false on both signals is clean — records predating fingerprinting must
 * not fall between "flagged" and "clean".
 */
export function matchesPayoutDuplicateFilter(
  row: DuplicateSignals,
  filter: PayoutDuplicateFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "clean") return isCleanForPayout(row);
  if (filter === "ip_review") return isIpReviewOnly(row);
  // "flagged" = any duplicate signal (IP or fingerprint)
  return isAnyDuplicate(row);
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
  duplicate_cluster_id: string;
  is_fingerprint_cluster_original: string;
  duplicate_gaming_pattern: string;
};

export function buildDuplicateExportFields(
  row: DuplicateSignals,
): DuplicateExportFields {
  const matched = row.originalParticipantLeadId?.trim() ?? "";
  return {
    duplicate_flag: formatDuplicateFlagExport(row),
    duplicate_match_type: formatDuplicateMatchTypeExport(row),
    duplicate_matched_lead_id: isAnyDuplicate(row) ? matched : "",
    duplicate_cluster_id: row.duplicateClusterId ?? "",
    is_fingerprint_cluster_original:
      row.isFingerprintClusterOriginal === true ? "Yes" : "",
    duplicate_gaming_pattern: row.duplicateGamingPattern ?? "",
  };
}
