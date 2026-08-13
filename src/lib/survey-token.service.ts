import { randomBytes } from "node:crypto";

import { getAppUrl } from "@/lib/app-url";
import type { Participant } from "@/types/domain";

/** Default survey link validity after admin grants access. */
export const SURVEY_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SurveyTokenValidation =
  | { valid: true }
  | { valid: false; reason: string };

export type SurveyTokenRecordValidation =
  | {
      valid: true;
      leadId: string;
      formVersion: number | null;
      token: string;
    }
  | { valid: false; reason: string };

export type SurveyAccessFields = {
  status: string;
  refillRequired: boolean;
  surveyAccessGranted: boolean;
  surveyToken: string | null;
  surveyTokenExpiresAt: Date | null;
};

/** Cryptographically secure opaque token — never embeds lead_id. */
export function generateSurveyToken(): string {
  return randomBytes(16).toString("hex");
}

export function buildSurveyUrl(surveyToken: string, baseUrl?: string): string {
  const origin = (baseUrl ?? getAppUrl()).replace(/\/$/, "");
  return `${origin}/survey?t=${encodeURIComponent(surveyToken)}`;
}

export function computeSurveyTokenExpiry(
  createdAt: Date = new Date(),
): Date {
  return new Date(createdAt.getTime() + SURVEY_TOKEN_TTL_MS);
}

export function isSurveyTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() <= Date.now();
}

export function canAccessSurvey(participant: SurveyAccessFields): boolean {
  // Survey access is independent of screener refill_required.
  if (participant.status !== "eligible") {
    return false;
  }
  if (!participant.surveyAccessGranted || !participant.surveyToken?.trim()) {
    return false;
  }
  if (isSurveyTokenExpired(participant.surveyTokenExpiresAt)) {
    return false;
  }
  return true;
}

export function validateSurveyToken(
  participant: SurveyAccessFields,
  token: string | null | undefined,
  options?: { surveyAlreadySubmitted?: boolean },
): SurveyTokenValidation {
  if (!token?.trim()) {
    return { valid: false, reason: "MISSING_TOKEN" };
  }

  if (options?.surveyAlreadySubmitted) {
    return { valid: false, reason: "ALREADY_SUBMITTED" };
  }

  if (!participant.surveyToken || participant.surveyToken !== token.trim()) {
    return { valid: false, reason: "TOKEN_MISMATCH" };
  }

  if (!participant.surveyAccessGranted) {
    return { valid: false, reason: "ACCESS_NOT_GRANTED" };
  }

  if (participant.status !== "eligible") {
    return { valid: false, reason: "NOT_ELIGIBLE" };
  }

  if (isSurveyTokenExpired(participant.surveyTokenExpiresAt)) {
    return { valid: false, reason: "TOKEN_EXPIRED" };
  }

  return { valid: true };
}

export function toSurveyAccessFields(participant: Participant): SurveyAccessFields {
  return {
    status: participant.status,
    refillRequired: participant.refillRequired,
    surveyAccessGranted: participant.surveyAccessGranted,
    surveyToken: participant.surveyToken,
    surveyTokenExpiresAt: participant.surveyTokenExpiresAt,
  };
}
