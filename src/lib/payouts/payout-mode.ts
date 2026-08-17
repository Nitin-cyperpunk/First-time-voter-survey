export type PayoutMode = "referral" | "survey";

/** Survey-completion / QC outcomes — excludes terminated & pre-survey statuses. */
export const SURVEY_PAYOUT_STATUSES = new Set([
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
]);

export function matchesPayoutMode(
  qcStatus: string,
  mode: PayoutMode,
): boolean {
  if (mode === "referral") {
    return true;
  }
  return SURVEY_PAYOUT_STATUSES.has(qcStatus.toLowerCase());
}

export function payoutModeLabel(mode: PayoutMode): string {
  return mode === "survey" ? "Survey" : "Referral";
}
