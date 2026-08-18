import { isTerminatedStatus, isQualifiedCompletionStatus } from "@/lib/participant-lifecycle";
import {
  isFingerprintFlagged,
  isIpReviewOnly,
  isQcEffectiveFail,
  type DeliverableRow,
  type DuplicateSignals,
} from "@/lib/respondents/duplicate-visibility";
import { isSurveyDataComplete } from "@/lib/respondents/survey-completeness";

export type QcStatusValue = "pass" | "fail" | "review";

export type QcStatusRow = DuplicateSignals & {
  status: string;
  qcStatusOverride?: QcStatusValue | null;
  surveyDataIncomplete?: boolean;
};

/** Minimum non-whitespace characters for an override reason (server-enforced too). */
export const QC_OVERRIDE_MIN_REASON_LENGTH = 10;

export const QC_STATUS_LABELS: Record<QcStatusValue, string> = {
  pass: "Pass",
  fail: "Fail",
  review: "Review",
};

export const QC_FILTER_OPTIONS = [
  { value: "all", label: "All QC" },
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "review", label: "Review" },
  { value: "overridden", label: "Overridden" },
] as const;

export type QcFilter = (typeof QC_FILTER_OPTIONS)[number]["value"];

/**
 * Automatic QC rules (single source — reads duplicate-visibility, does not re-derive).
 *
 * PASS   = not fingerprint-cluster member AND not terminated AND survey data present
 * FAIL   = fingerprint cluster member (duplicate_flag=true, either side incl. original)
 * REVIEW = terminated without fingerprint cluster; OR IP-only flagged; OR hollow complete
 *
 * Terminated → REVIEW (not auto-fail) so mistaken terminations can be recovered via override.
 * IP-only never auto-fails — CGNAT / shared home connections in India are weak evidence.
 * Hollow completes → REVIEW (not auto-fail) so a mistaken flag can be overridden.
 */
export function computeAutoQcStatus(row: QcStatusRow): QcStatusValue {
  if (isFingerprintFlagged(row)) return "fail";
  if (
    !isSurveyDataComplete({
      status: row.status,
      surveyDataIncomplete: row.surveyDataIncomplete,
    })
  ) {
    return "review";
  }
  if (isTerminatedStatus(row.status)) return "review";
  if (isIpReviewOnly(row)) return "review";
  return "pass";
}

export function computeEffectiveQcStatus(row: QcStatusRow): QcStatusValue {
  const override = row.qcStatusOverride;
  if (override === "pass" || override === "fail" || override === "review") {
    return override;
  }
  return computeAutoQcStatus(row);
}

export function isQcStatusOverridden(row: QcStatusRow): boolean {
  const o = row.qcStatusOverride;
  return o === "pass" || o === "fail" || o === "review";
}

export function validateQcOverrideReason(reason: string): boolean {
  return reason.trim().length >= QC_OVERRIDE_MIN_REASON_LENGTH;
}

export function matchesQcFilter(
  row: QcStatusRow,
  filter: QcFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "overridden") return isQcStatusOverridden(row);
  return computeEffectiveQcStatus(row) === filter;
}

/** Survey payout list + amount — reads effective QC pass, not duplicate-clean alone. */
export function isSurveyPayoutEligible(
  row: DeliverableRow,
  effectiveQc: QcStatusValue,
): boolean {
  if (!isQualifiedCompletionStatus(row.status)) return false;
  if (isQcEffectiveFail(row.status)) return false;
  if (
    !isSurveyDataComplete({
      status: row.status,
      surveyDataIncomplete: row.surveyDataIncomplete,
    })
  ) {
    return false;
  }
  return effectiveQc === "pass";
}

export function surveyPayoutAmount(
  row: DeliverableRow,
  effectiveQc: QcStatusValue,
  surveyRewardAmount: number,
): number {
  return isSurveyPayoutEligible(row, effectiveQc)
    ? surveyRewardAmount
    : 0;
}

export function qcStatusVariant(
  effective: QcStatusValue,
  overridden: boolean,
): "success" | "fail" | "review" | "completed" {
  if (overridden) {
    if (effective === "pass") return "success";
    if (effective === "fail") return "fail";
    return "review";
  }
  if (effective === "pass") return "success";
  if (effective === "fail") return "fail";
  return "review";
}

export function autoQcRuleSummary(row: QcStatusRow): string {
  if (isFingerprintFlagged(row)) {
    return "Fingerprint duplicate cluster member (both sides ineligible).";
  }
  if (
    !isSurveyDataComplete({
      status: row.status,
      surveyDataIncomplete: row.surveyDataIncomplete,
    })
  ) {
    return "Survey data missing or empty — held for review (hollow complete).";
  }
  if (isTerminatedStatus(row.status)) {
    return "Terminated — held for manual review (not auto-failed).";
  }
  if (isIpReviewOnly(row)) {
    return "IP-only flag — review only; not auto-failed.";
  }
  return "No fingerprint flag; not terminated.";
}
