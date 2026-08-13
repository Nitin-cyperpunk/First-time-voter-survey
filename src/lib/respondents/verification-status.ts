import type { StatusPillVariant } from "@/components/ui/status-pill";

export type EligibilityVerificationStatus = "pending" | "verified" | "rejected";

export const ELIGIBILITY_VERIFICATION_LABELS: Record<
  EligibilityVerificationStatus,
  string
> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
};

export function deriveEligibilityVerificationStatus(
  participantStatus: string,
): EligibilityVerificationStatus {
  const normalized = participantStatus.toLowerCase();
  if (normalized === "eligible") return "verified";
  if (normalized === "not_eligible") return "rejected";
  if (normalized === "lead" || normalized === "under_review") return "pending";
  return "verified";
}

export function eligibilityVerificationVariant(
  status: EligibilityVerificationStatus,
): StatusPillVariant {
  switch (status) {
    case "pending":
      return "pending";
    case "verified":
      return "eligible";
    case "rejected":
      return "notEligible";
  }
}

export function matchesEligibilityVerificationFilter(
  participantStatus: string,
  filter: "all" | EligibilityVerificationStatus,
): boolean {
  if (filter === "all") return true;
  return deriveEligibilityVerificationStatus(participantStatus) === filter;
}

export const ELIGIBILITY_VERIFICATION_FILTERS: Array<{
  value: "all" | EligibilityVerificationStatus;
  label: string;
}> = [
  { value: "all", label: "All verification" },
  { value: "pending", label: "Verification Pending" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];
