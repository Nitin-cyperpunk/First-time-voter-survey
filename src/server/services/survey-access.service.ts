import {
  buildSurveyUrl,
  computeSurveyTokenExpiry,
  generateSurveyToken,
} from "@/lib/survey-token.service";
import { normalizeParticipantStatus } from "@/lib/participant-lifecycle";
import {
  findParticipantByLeadId,
  grantSurveyAccess,
} from "@/server/repositories/participants.repository";
import { getActivePublishedForm } from "@/server/repositories/forms.repository";
import {
  createSurveyTokenRow,
  deactivateSurveyTokensForLead,
  tokenExists,
} from "@/server/repositories/survey-tokens.repository";
import { hasSurveyResponse } from "@/server/repositories/survey.repository";

const MAX_TOKEN_ATTEMPTS = 12;

async function generateUniqueSurveyToken(): Promise<string> {
  for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt++) {
    const token = generateSurveyToken();
    if (!(await tokenExists(token))) return token;
  }

  throw new Error("SURVEY_TOKEN_GENERATION_FAILED");
}

export async function grantParticipantSurveyAccess(
  leadId: string,
  verificationMethod = "calleezer",
  createdBy = "admin",
) {
  const participant = await findParticipantByLeadId(leadId);
  if (!participant) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  const status = normalizeParticipantStatus(participant.status);
  if (status !== "eligible") {
    throw new Error("NOT_ELIGIBLE");
  }

  if (await hasSurveyResponse(leadId)) {
    throw new Error("SURVEY_ALREADY_SUBMITTED");
  }

  const surveyToken = await generateUniqueSurveyToken();
  const tokenCreatedAt = new Date();
  const tokenExpiresAt = computeSurveyTokenExpiry(tokenCreatedAt);
  const verifiedAt = new Date();

  let formVersion: number | null = null;
  try {
    const form = await getActivePublishedForm("survey");
    formVersion = form?.version ?? null;
  } catch {
    formVersion = null;
  }

  await deactivateSurveyTokensForLead(leadId);

  await createSurveyTokenRow({
    leadId,
    token: surveyToken,
    formVersion,
    expiresAt: tokenExpiresAt,
    createdBy,
  });

  const updated = await grantSurveyAccess(leadId, {
    surveyToken,
    tokenCreatedAt,
    tokenExpiresAt,
    verifiedAt,
    verificationMethod,
  });

  if (!updated) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  return {
    surveyToken,
    surveyUrl: buildSurveyUrl(surveyToken),
    surveyAccessGranted: updated.surveyAccessGranted,
    surveyTokenExpiresAt: updated.surveyTokenExpiresAt,
    verifiedAt: updated.verifiedAt,
    verificationMethod: updated.verificationMethod,
  };
}

/**
 * Admin Survey Refill (DM & Verify): mint a fresh unique survey token and return
 * the public /survey?t=... URL. Does NOT touch screener answers or refill_token.
 */
export async function requestParticipantSurveyRefill(
  leadId: string,
  _reason: string,
) {
  const participant = await findParticipantByLeadId(leadId);
  if (!participant) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  const status = normalizeParticipantStatus(participant.status);
  if (status !== "eligible") {
    throw new Error("NOT_ELIGIBLE");
  }

  if (!participant.surveyAccessGranted) {
    throw new Error("SURVEY_ACCESS_NOT_GRANTED");
  }

  if (participant.refillRequired) {
    throw new Error("SCREENER_REFILL_ACTIVE");
  }

  if (await hasSurveyResponse(leadId)) {
    throw new Error("SURVEY_ALREADY_SUBMITTED");
  }

  const surveyToken = await generateUniqueSurveyToken();
  const tokenCreatedAt = new Date();
  const tokenExpiresAt = computeSurveyTokenExpiry(tokenCreatedAt);

  let formVersion: number | null = null;
  try {
    const form = await getActivePublishedForm("survey");
    formVersion = form?.version ?? null;
  } catch {
    formVersion = null;
  }

  await deactivateSurveyTokensForLead(leadId);

  await createSurveyTokenRow({
    leadId,
    token: surveyToken,
    formVersion,
    expiresAt: tokenExpiresAt,
    createdBy: "admin_survey_refill",
  });

  const updated = await grantSurveyAccess(leadId, {
    surveyToken,
    tokenCreatedAt,
    tokenExpiresAt,
    verifiedAt: participant.verifiedAt ?? tokenCreatedAt,
    verificationMethod: participant.verificationMethod ?? "admin_survey_refill",
  });

  if (!updated) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  return {
    participant: updated,
    surveyToken,
    surveyUrl: buildSurveyUrl(surveyToken),
  };
}
