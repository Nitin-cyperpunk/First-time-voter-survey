"use client";

import {
  StatusPill,
  type StatusPillVariant,
} from "@/components/ui/status-pill";
import {
  deriveEligibilityVerificationStatus,
  ELIGIBILITY_VERIFICATION_LABELS,
  eligibilityVerificationVariant,
  type EligibilityVerificationStatus,
} from "@/lib/respondents/verification-status";

export function VerificationStatusBadge({
  participantStatus,
}: {
  participantStatus: string;
}) {
  const status = deriveEligibilityVerificationStatus(participantStatus);
  return (
    <StatusPill variant={eligibilityVerificationVariant(status)}>
      {ELIGIBILITY_VERIFICATION_LABELS[status]}
    </StatusPill>
  );
}

export function verificationStatusForFilter(
  participantStatus: string,
): EligibilityVerificationStatus {
  return deriveEligibilityVerificationStatus(participantStatus);
}
