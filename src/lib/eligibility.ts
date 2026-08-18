import {
  countParticipantsByIp,
  updateParticipantDuplicateFlag,
  updateIpDuplicateFlagsForAddress,
} from "@/server/repositories/participants.repository";

/**
 * Persists is_flagged_duplicate from shared-IP count. Does not change lifecycle
 * status — phone uniqueness is the hard gate; IP is flag-only.
 *
 * When count > 1, ALL participants on that IP are flagged for review (both
 * sides), not just the newest registrant. Fingerprint ineligibility is separate
 * (duplicate_flag) and handled by checkDuplicateFingerprint.
 */
export async function syncIpDuplicateFlag(
  participantId: string,
  ipAddress: string | null | undefined,
): Promise<number> {
  if (!ipAddress?.trim()) {
    await updateParticipantDuplicateFlag(participantId, false);
    return 1;
  }

  const duplicateCount = await countParticipantsByIp(ipAddress);
  await updateIpDuplicateFlagsForAddress(ipAddress, duplicateCount > 1);

  return duplicateCount;
}
