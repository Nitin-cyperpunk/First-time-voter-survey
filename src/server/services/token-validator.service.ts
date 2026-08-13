import {
  isSurveyTokenExpired,
  type SurveyTokenRecordValidation,
} from "@/lib/survey-token.service";
import { findSurveyTokenRow } from "@/server/repositories/survey-tokens.repository";
import { hasSurveyResponse } from "@/server/repositories/survey.repository";
import { findParticipantByLeadId } from "@/server/repositories/participants.repository";

export async function validateSurveyTokenRecord(
  token: string | null | undefined,
): Promise<SurveyTokenRecordValidation> {
  const normalized = token?.trim();
  if (!normalized) {
    return { valid: false, reason: "MISSING_TOKEN" };
  }

  const row = await findSurveyTokenRow(normalized);
  if (!row) {
    return { valid: false, reason: "NOT_FOUND" };
  }

  if (!row.is_active) {
    return { valid: false, reason: "INACTIVE" };
  }

  if (isSurveyTokenExpired(new Date(row.expires_at))) {
    return { valid: false, reason: "TOKEN_EXPIRED" };
  }

  if (row.used_at) {
    return { valid: false, reason: "ALREADY_USED" };
  }

  const participant = await findParticipantByLeadId(row.lead_id);
  if (!participant) {
    return { valid: false, reason: "PARTICIPANT_NOT_FOUND" };
  }

  if (participant.status !== "eligible") {
    return { valid: false, reason: "NOT_ELIGIBLE" };
  }

  // Screener refill (refill_required) must NOT invalidate an already-granted
  // survey token. Survey access and screener refill are separate flows; a
  // valid unused survey token should open the survey. Use a specific page
  // message only when survey access itself is missing.

  if (!participant.surveyAccessGranted) {
    return { valid: false, reason: "ACCESS_NOT_GRANTED" };
  }

  if (await hasSurveyResponse(row.lead_id)) {
    return { valid: false, reason: "ALREADY_SUBMITTED" };
  }

  return {
    valid: true,
    leadId: row.lead_id,
    formVersion: row.form_version,
    token: normalized,
  };
}
