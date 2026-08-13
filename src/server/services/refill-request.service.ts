import {
  buildRefillUrl,
  generateRefillToken,
  type RefillTokenValidation,
} from "@/lib/refill-token.service";
import {
  extractBasicContactFromScreenerRow,
} from "@/lib/participant-basic-contact";
import {
  findByRefillToken,
  findParticipantByLeadId,
  refillTokenExists,
  setRefillRequest,
  updateParticipantBasicContact,
} from "@/server/repositories/participants.repository";
import { deleteFormTerminationsByLeadId } from "@/server/repositories/form-terminations.repository";
import { deleteScreenerResponse, getScreenerResponse } from "@/server/repositories/screener.repository";

const MAX_TOKEN_ATTEMPTS = 12;

async function generateUniqueRefillToken(): Promise<string> {
  for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt++) {
    const token = generateRefillToken();
    if (!(await refillTokenExists(token))) return token;
  }
  throw new Error("REFILL_TOKEN_GENERATION_FAILED");
}

/**
 * Admin Request Refill: clear prior screener answers, set refill flags,
 * mint a unique opaque token, and return the public refill URL.
 */
export async function requestParticipantRefill(leadId: string, reason: string) {
  const participant = await findParticipantByLeadId(leadId);
  if (!participant) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  const screenerSnapshot = await getScreenerResponse(leadId);
  const basicContact = extractBasicContactFromScreenerRow(screenerSnapshot);

  await deleteScreenerResponse(leadId);
  await deleteFormTerminationsByLeadId(leadId);

  const refillToken = await generateUniqueRefillToken();
  const updated = await setRefillRequest(leadId, reason, refillToken);
  if (!updated) {
    throw new Error("REFILL_REQUEST_FAILED");
  }

  await updateParticipantBasicContact(leadId, {
    email: basicContact.email ?? participant.email,
    area: basicContact.area ?? participant.area,
    pincode: basicContact.pincode ?? participant.pincode,
  });

  const token = updated.refillToken?.trim() || refillToken;
  const refreshed =
    (await findParticipantByLeadId(leadId)) ?? updated;

  return {
    participant: refreshed,
    refillToken: token,
    refillUrl: buildRefillUrl(token),
  };
}

/**
 * Validate an opaque refill token from /refill?t=...
 * Binds to exactly one participant; requires active refill_required.
 */
export async function validateRefillTokenRecord(
  token: string | null | undefined,
): Promise<RefillTokenValidation> {
  const normalized = token?.trim();
  if (!normalized) {
    return { valid: false, reason: "MISSING_TOKEN" };
  }

  const participant = await findByRefillToken(normalized);
  if (!participant) {
    return { valid: false, reason: "NOT_FOUND" };
  }

  if (!participant.refillRequired) {
    return { valid: false, reason: "REFILL_NOT_REQUIRED" };
  }

  if (participant.refillToken !== normalized) {
    return { valid: false, reason: "TOKEN_MISMATCH" };
  }

  return {
    valid: true,
    leadId: participant.leadId,
    token: normalized,
  };
}
