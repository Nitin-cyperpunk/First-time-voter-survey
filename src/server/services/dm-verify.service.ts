import {
  DISPOSITION_KEY_NOT_ELIGIBLE,
  DISPOSITION_KEY_VERIFIED,
  dispositionContradictsVerified,
} from "@/lib/call-dispositions/defaults";
import type { DmStatus } from "@/lib/dm-verify";
import {
  findParticipantByLeadId,
  updateParticipantCallDisposition,
  updateParticipantDmStatus,
} from "@/server/repositories/participants.repository";
import { assertEnabledDispositionKey } from "@/server/services/call-dispositions.service";

export type DmVerifyAction =
  | "mark_message_received"
  | "mark_call_completed"
  | "set_call_disposition"
  | "verify_participant"
  | "mark_completed";

export async function setCallDisposition(
  leadId: string,
  dispositionKey: string,
  notes: string | null,
) {
  const participant = await findParticipantByLeadId(leadId);
  if (!participant) throw new Error("PARTICIPANT_NOT_FOUND");
  if (participant.status !== "eligible") throw new Error("NOT_ELIGIBLE");

  await assertEnabledDispositionKey(dispositionKey);
  const trimmedNotes = notes?.trim() || null;

  if (
    participant.verifiedAt &&
    dispositionContradictsVerified(dispositionKey)
  ) {
    throw new Error("DISPOSITION_CONTRADICTS_VERIFIED");
  }

  if (dispositionKey === DISPOSITION_KEY_VERIFIED) {
    return updateParticipantCallDisposition(leadId, {
      dispositionKey,
      notes: trimmedNotes,
      dmStatus: "verified",
      verifiedAt: new Date(),
      verificationMethod: "phone_call",
    });
  }

  if (dispositionKey === DISPOSITION_KEY_NOT_ELIGIBLE) {
    return updateParticipantCallDisposition(leadId, {
      dispositionKey,
      notes: trimmedNotes,
      status: "not_eligible",
    });
  }

  return updateParticipantCallDisposition(leadId, {
    dispositionKey,
    notes: trimmedNotes,
  });
}

export async function applyDmVerifyAction(
  leadId: string,
  action: DmVerifyAction,
  options?: {
    dispositionKey?: string;
    notes?: string | null;
  },
) {
  const participant = await findParticipantByLeadId(leadId);
  if (!participant) throw new Error("PARTICIPANT_NOT_FOUND");
  if (participant.status !== "eligible") throw new Error("NOT_ELIGIBLE");

  switch (action) {
    case "mark_message_received":
      return updateParticipantDmStatus(leadId, "message_received");

    case "mark_call_completed":
      return updateParticipantCallDisposition(leadId, {
        dispositionKey: DISPOSITION_KEY_VERIFIED,
        notes: null,
        dmStatus: "verified",
        verifiedAt: new Date(),
        verificationMethod: "phone_call",
      });

    case "set_call_disposition": {
      const dispositionKey = options?.dispositionKey?.trim();
      if (!dispositionKey) throw new Error("DISPOSITION_REQUIRED");
      return setCallDisposition(leadId, dispositionKey, options?.notes ?? null);
    }

    case "verify_participant":
      return updateParticipantDmStatus(leadId, "verified", {
        verifiedAt: new Date(),
        verificationMethod: "instagram_dm",
      });

    case "mark_completed":
      return updateParticipantDmStatus(leadId, "completed" satisfies DmStatus);
  }
}
