import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FingerprintEventInput = {
  participantLeadId: string;
  deviceFingerprint: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  eventType: string;
  originalParticipantLeadId?: string | null;
};

export async function createFingerprintEvent(
  input: FingerprintEventInput,
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("fingerprint_events").insert({
    participant_lead_id: input.participantLeadId,
    device_fingerprint: input.deviceFingerprint,
    ip_address: input.ipAddress,
    user_agent: input.userAgent,
    event_type: input.eventType,
    original_participant_lead_id: input.originalParticipantLeadId ?? null,
  });

  if (error) throw error;
}
