import { NextResponse } from "next/server";

import { findDispositionLabel } from "@/lib/call-dispositions/parse";
import { resolveDmStatus } from "@/lib/dm-verify";
import { getCallDispositions } from "@/server/repositories/form-settings.repository";
import { findParticipantByLeadId } from "@/server/repositories/participants.repository";
import {
  applyDmVerifyAction,
  type DmVerifyAction,
} from "@/server/services/dm-verify.service";

const VALID_ACTIONS = new Set<DmVerifyAction>([
  "mark_message_received",
  "mark_call_completed",
  "set_call_disposition",
  "verify_participant",
  "mark_completed",
]);

export function mapDmVerifyActionError(error: unknown) {
  if (!(error instanceof Error)) return "Action failed.";
  switch (error.message) {
    case "PARTICIPANT_NOT_FOUND":
      return "Participant not found.";
    case "NOT_ELIGIBLE":
      return "Only eligible participants can be updated in DM & Verify.";
    case "INVALID_DISPOSITION":
      return "Select a valid call disposition.";
    case "DISPOSITION_REQUIRED":
      return "A call disposition is required.";
    case "DISPOSITION_CONTRADICTS_VERIFIED":
      return "This participant is already verified. Choose a compatible call outcome, or clear verification first.";
    default:
      return error.message || "Action failed.";
  }
}

type DmVerifyActionBody = {
  action?: DmVerifyAction;
  dispositionKey?: string;
  notes?: string | null;
};

export async function executeDmVerifyAction(
  leadId: string,
  body: DmVerifyActionBody,
) {
  const action = body?.action as DmVerifyAction;

  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  await applyDmVerifyAction(leadId, action, {
    dispositionKey:
      typeof body?.dispositionKey === "string"
        ? body.dispositionKey
        : undefined,
    notes: typeof body?.notes === "string" ? body.notes : null,
  });

  const resolved = await findParticipantByLeadId(leadId);
  const dispositionConfig = await getCallDispositions();

  return NextResponse.json({
    success: true,
    dmStatus: resolved ? resolveDmStatus(resolved) : null,
    status: resolved?.status ?? null,
    callDisposition: resolved?.callDisposition ?? null,
    callDispositionLabel: findDispositionLabel(
      dispositionConfig,
      resolved?.callDisposition,
    ),
    callDispositionNotes: resolved?.callDispositionNotes ?? null,
    callDispositionAt: resolved?.callDispositionAt?.toISOString() ?? null,
    verifiedAt: resolved?.verifiedAt?.toISOString() ?? null,
    surveyUrl: null,
  });
}
