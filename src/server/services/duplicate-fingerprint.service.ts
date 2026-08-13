import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createFingerprintEvent } from "@/server/repositories/fingerprint-events.repository";

const DUPLICATE_REASON = "Duplicate Device Fingerprint";

export type CheckDuplicateFingerprintInput = {
  leadId: string;
  fingerprint: string | null;
  ipAddress: string | null;
  userAgent?: string | null;
};

async function findEarliestParticipantWithFingerprint(
  fingerprint: string,
  currentLeadId: string,
): Promise<{ leadId: string } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("lead_id")
    .eq("device_fingerprint", fingerprint)
    .neq("lead_id", currentLeadId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? { leadId: data.lead_id } : null;
}

async function flagParticipantDuplicateFingerprint(input: {
  leadId: string;
  originalParticipantLeadId: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("participants")
    .update({
      duplicate_flag: true,
      duplicate_reason: DUPLICATE_REASON,
      duplicate_detected_at: new Date().toISOString(),
      review_status: "Pending",
      original_participant_lead_id: input.originalParticipantLeadId,
    })
    .eq("lead_id", input.leadId);

  if (error) throw error;
}

/**
 * Detect duplicate device fingerprints for the current participant only.
 * Fail-open: never throws; submission must continue regardless of outcome.
 */
export async function checkDuplicateFingerprint(
  input: CheckDuplicateFingerprintInput,
): Promise<void> {
  try {
    if (!input.fingerprint) {
      return;
    }

    const original = await findEarliestParticipantWithFingerprint(
      input.fingerprint,
      input.leadId,
    );

    if (!original) {
      await createFingerprintEvent({
        participantLeadId: input.leadId,
        deviceFingerprint: input.fingerprint,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent ?? null,
        eventType: "FIRST_SEEN",
      });
      return;
    }

    await flagParticipantDuplicateFingerprint({
      leadId: input.leadId,
      originalParticipantLeadId: original.leadId,
    });

    await createFingerprintEvent({
      participantLeadId: input.leadId,
      deviceFingerprint: input.fingerprint,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent ?? null,
      eventType: "DUPLICATE_DETECTED",
      originalParticipantLeadId: original.leadId,
    });
  } catch (error) {
    console.error("[checkDuplicateFingerprint] failed open:", error);
  }
}
