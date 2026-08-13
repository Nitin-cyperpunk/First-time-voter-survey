import {
  countParticipantsByIp,
  updateParticipantDuplicateFlag,
} from "@/server/repositories/participants.repository";

/**
 * Persists is_flagged_duplicate from shared-IP count. Does not change lifecycle
 * status — phone uniqueness is the hard gate; IP is flag-only.
 */
export async function syncIpDuplicateFlag(
  participantId: string,
  ipAddress: string | null | undefined,
): Promise<number> {
  const duplicateCount = ipAddress
    ? await countParticipantsByIp(ipAddress)
    : 1;

  await updateParticipantDuplicateFlag(participantId, duplicateCount > 1);

  return duplicateCount;
}
