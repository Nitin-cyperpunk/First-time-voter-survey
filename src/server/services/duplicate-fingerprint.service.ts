import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createFingerprintEvent } from "@/server/repositories/fingerprint-events.repository";

// ─── Operative rule (preserved here for traceability) ────────────────────────
//
// FINGERPRINT match (including "both"):
//   Both sides → INELIGIBLE, excluded from "clean", no reward.
//   A device fingerprint identifies the same physical device with high confidence.
//
// IP-ONLY match:
//   Flagged for REVIEW only. Still "clean", still payable.
//   CGNAT in India means hundreds of mobile users share one public IP address,
//   and household members share a home connection. Withholding money on IP alone
//   would penalise a large number of genuine respondents. A fingerprint match is
//   the basis for withholding — not an IP match.
//
// These are two separately queryable states via duplicate_flag (fingerprint)
// and is_flagged_duplicate (IP).
//
// ─────────────────────────────────────────────────────────────────────────────

const DUPLICATE_REASON = "Duplicate Device Fingerprint";

export const GAMING_PATTERN_SCREENER_EVASION = "screener_evasion" as const;

export type CheckDuplicateFingerprintInput = {
  leadId: string;
  /** Current participant's status ("terminated" | "completed" | …). */
  status: string;
  fingerprint: string | null;
  ipAddress: string | null;
  userAgent?: string | null;
};

type ClusterMember = {
  leadId: string;
  status: string;
  clusterId: string | null;
};

/**
 * Return ALL existing participants with the same fingerprint (excluding self).
 * Sorted ascending by created_at so index 0 is the earliest.
 */
async function findAllParticipantsWithFingerprint(
  fingerprint: string,
  currentLeadId: string,
): Promise<ClusterMember[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("lead_id, status, duplicate_cluster_id")
    .eq("device_fingerprint", fingerprint)
    .neq("lead_id", currentLeadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    leadId: row.lead_id,
    status: row.status,
    clusterId: (row as Record<string, unknown>).duplicate_cluster_id as string | null ?? null,
  }));
}

/**
 * Determine the gaming pattern label for the incoming (new) record.
 *
 * "screener_evasion": an EARLIER record on the same device was TERMINATED,
 * and this NEW record completed — the strongest signal of deliberate screener
 * manipulation. Only applied to the later completed entry; the terminated
 * original receives no gaming label (it was the genuine first attempt).
 */
function resolveGamingPattern(
  newStatus: string,
  existingMembers: ClusterMember[],
): typeof GAMING_PATTERN_SCREENER_EVASION | null {
  if (newStatus === "terminated") return null;
  const hasTerminatedPredecessor = existingMembers.some(
    (m) => m.status === "terminated",
  );
  return hasTerminatedPredecessor ? GAMING_PATTERN_SCREENER_EVASION : null;
}

/**
 * Flag a single participant as part of a fingerprint cluster.
 * isOriginal=true → this is the first/earliest member; still ineligible
 * (duplicate_flag=true) but marked so QC can distinguish it from later entries.
 */
async function flagClusterMember(input: {
  leadId: string;
  clusterId: string;
  originalLeadId: string;
  isOriginal: boolean;
  gamingPattern: string | null;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("participants")
    .update({
      duplicate_flag: true,
      duplicate_reason: DUPLICATE_REASON,
      duplicate_detected_at: new Date().toISOString(),
      review_status: "Pending",
      // Point every member to the cluster's earliest record for traceability.
      original_participant_lead_id: input.isOriginal ? null : input.originalLeadId,
      // New cluster fields (added in migration 025).
      duplicate_cluster_id: input.clusterId,
      is_fingerprint_cluster_original: input.isOriginal,
      ...(input.gamingPattern !== null
        ? { duplicate_gaming_pattern: input.gamingPattern }
        : {}),
    })
    .eq("lead_id", input.leadId);

  if (error) throw error;
}

/**
 * Detect duplicate device fingerprints and flag BOTH the new record AND all
 * existing members of the same fingerprint cluster.
 *
 * Operative rule:
 *   - Fingerprint match → both sides ineligible (duplicate_flag=true).
 *   - IP-only → review flag only (handled separately via syncIpDuplicateFlag).
 *
 * Fail-open: any error is logged and swallowed — duplicate detection must never
 * block data collection or reject a submission.
 */
export async function checkDuplicateFingerprint(
  input: CheckDuplicateFingerprintInput,
): Promise<void> {
  try {
    if (!input.fingerprint) return;

    const existingMembers = await findAllParticipantsWithFingerprint(
      input.fingerprint,
      input.leadId,
    );

    if (existingMembers.length === 0) {
      // First time this fingerprint is seen — record the event, no flags set.
      await createFingerprintEvent({
        participantLeadId: input.leadId,
        deviceFingerprint: input.fingerprint,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent ?? null,
        eventType: "FIRST_SEEN",
      });
      return;
    }

    // Resolve or inherit the cluster ID. If any existing member already has
    // one (from a previous detection run), reuse it; otherwise mint a new UUID.
    const existingClusterId = existingMembers.find((m) => m.clusterId)?.clusterId ?? null;
    const clusterId = existingClusterId ?? randomUUID();

    // The earliest existing member is the cluster original.
    const originalLeadId = existingMembers[0]!.leadId;

    // Determine gaming pattern for the new (incoming) record.
    const gamingPattern = resolveGamingPattern(input.status, existingMembers);

    // Flag the new (incoming) record.
    await flagClusterMember({
      leadId: input.leadId,
      clusterId,
      originalLeadId,
      isOriginal: false,
      gamingPattern,
    });

    // Flag every existing member that is not yet part of this cluster.
    for (const member of existingMembers) {
      const isOriginal = member.leadId === originalLeadId;
      // Re-flag even if duplicate_flag is already true, to ensure cluster_id
      // is stamped (idempotent: same clusterId will be written again).
      await flagClusterMember({
        leadId: member.leadId,
        clusterId,
        originalLeadId,
        isOriginal,
        gamingPattern: null, // gaming pattern only applies to the later entry
      });
    }

    await createFingerprintEvent({
      participantLeadId: input.leadId,
      deviceFingerprint: input.fingerprint,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent ?? null,
      eventType: "DUPLICATE_DETECTED",
      originalParticipantLeadId: originalLeadId,
    });
  } catch (error) {
    console.error("[checkDuplicateFingerprint] failed open:", error);
  }
}
