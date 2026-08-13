import type { LaunchRegistrationInput } from "@/features/launch/schemas/registration";
import { determineEligibility } from "@/lib/eligibility";
import { normalizeDeviceFingerprint } from "@/lib/device-fingerprint";
import { resolveScreenerCompletionTracking } from "@/lib/registration-terminations";
import {
  computeTotalDurationSec,
  mapFieldAnswersToQKeys,
  mapFieldTimesToQKeys,
  normalizeStoredAnswers,
  stripInternalAnswerKeys,
  type StoredAnswerValue,
  usesQKeyFormat,
  validateScreenerSubmission,
} from "@/lib/response-storage";
import type { Json } from "@/lib/supabase/types";
import {
  clearRefillRequest,
  findParticipantByLeadId,
  updateParticipantProfile,
} from "@/server/repositories/participants.repository";
import {
  createResponse,
  getActiveFormVersion,
  getScreenerResponse,
  updateResponse,
} from "@/server/repositories/screener.repository";
import { createFingerprintEvent } from "@/server/repositories/fingerprint-events.repository";
import type { FormExportSchema } from "@/lib/form-export/types";

function resolveStoredAnswers(
  normalizedAnswers: Record<string, StoredAnswerValue>,
  schema: FormExportSchema,
) {
  if (usesQKeyFormat(normalizedAnswers)) {
    return normalizedAnswers;
  }

  if (schema.fields.length > 0) {
    return mapFieldAnswersToQKeys(normalizedAnswers, schema);
  }

  return normalizedAnswers;
}

function resolveStoredResponseTimes(
  responseTimes: Record<string, number> | undefined,
  schema: FormExportSchema,
  rawAnswers: Record<string, StoredAnswerValue>,
) {
  if (!responseTimes) return null;

  if (usesQKeyFormat(rawAnswers)) {
    return responseTimes;
  }

  if (schema.fields.length > 0) {
    return mapFieldTimesToQKeys(responseTimes, schema);
  }

  return responseTimes;
}

function alignResponseTimes(
  answers: Record<string, StoredAnswerValue>,
  responseTimes: Record<string, number> | null,
): Record<string, number> | null {
  if (!responseTimes || !usesQKeyFormat(answers)) {
    return responseTimes;
  }

  const questionAnswers = stripInternalAnswerKeys(
    answers as Record<string, unknown>,
  ) as Record<string, StoredAnswerValue>;
  const aligned: Record<string, number> = {};
  for (const key of Object.keys(questionAnswers)) {
    aligned[key] = responseTimes[key] ?? 0;
  }
  return aligned;
}

function withTimingMetadata(
  answers: Record<string, StoredAnswerValue>,
  responseTimes: Record<string, number> | null,
  screens?: { currentScreen?: string; lastScreen?: string },
): Record<string, unknown> {
  const questionAnswers = stripInternalAnswerKeys(
    answers as Record<string, unknown>,
  ) as Record<string, StoredAnswerValue>;
  const payload: Record<string, unknown> = { ...questionAnswers };
  if (responseTimes && Object.keys(responseTimes).length > 0) {
    payload._st = responseTimes;
    payload._screen_times = responseTimes;
  }
  const lastScreen =
    screens?.lastScreen?.trim() || screens?.currentScreen?.trim() || "";
  if (lastScreen) {
    payload._last_screen = lastScreen;
  }
  return payload;
}

export async function submitParticipantRefill(
  leadId: string,
  input: LaunchRegistrationInput,
  options: { ipAddress?: string | null; userAgent?: string | null },
) {
  const participant = await findParticipantByLeadId(leadId);
  if (!participant) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  if (!participant.refillRequired) {
    throw new Error("REFILL_NOT_REQUIRED");
  }

  // A screener response may not exist yet (e.g. the original registration was
  // saved without captured answers). Upsert instead of failing so the refill
  // always persists and the participant is never trapped in a refill loop.
  const existingResponse = await getScreenerResponse(leadId);

  const form = (await getActiveFormVersion()) ?? {
    version: 1,
    schema: { version: 1, fields: [] } satisfies FormExportSchema,
    htmlContent: null,
  };

  const normalizedAnswers = normalizeStoredAnswers(input.answers);
  const storedAnswers = resolveStoredAnswers(normalizedAnswers, form.schema);
  const storedResponseTimes = resolveStoredResponseTimes(
    input.responseTimes,
    form.schema,
    normalizedAnswers,
  );
  // When answers use the Q-key format, response times must contain exactly the
  // same Q-keys. Realign here (filling 0 for any missing) so stray keys like
  // "name" coming from analytics never reach — and fail — validation.
  const alignedResponseTimes = alignResponseTimes(
    storedAnswers,
    storedResponseTimes,
  );

  const validation = validateScreenerSubmission(
    storedAnswers,
    alignedResponseTimes ?? undefined,
  );
  if (!validation.ok) {
    throw new Error(`INVALID_RESPONSE:${validation.error}`);
  }

  const startedAt = input.startedAt ? new Date(input.startedAt) : null;
  const submittedAt = input.submittedAt
    ? new Date(input.submittedAt)
    : new Date();
  const totalDurationSec =
    startedAt !== null
      ? computeTotalDurationSec(startedAt, submittedAt)
      : null;

  const deviceFingerprint = normalizeDeviceFingerprint(input.deviceFingerprint);

  const updatedParticipant = await updateParticipantProfile(leadId, {
    fullName: input.fullName,
    city: input.city,
    dob: input.dob,
    email: input.email?.trim() || null,
    area: input.area?.trim() || null,
    pincode: input.pincode?.trim() || null,
    ipAddress: options.ipAddress ?? null,
    userAgent: options.userAgent ?? null,
    deviceFingerprint,
  });

  if (!updatedParticipant) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  // Phone is locked during refill — never trust client-supplied mobile.

  await createFingerprintEvent({
    participantLeadId: leadId,
    deviceFingerprint,
    ipAddress: options.ipAddress ?? null,
    userAgent: options.userAgent ?? null,
    eventType: "screener_refill",
  });

  const screenerTracking = resolveScreenerCompletionTracking(input);

  const responsePayload = {
    mobile: updatedParticipant.mobile,
    formVersion: form.version,
    answers: withTimingMetadata(storedAnswers, alignedResponseTimes, {
      currentScreen: input.currentScreen,
      lastScreen: input.lastScreen,
    }) as Json,
    completionStatus: screenerTracking.completionStatus,
    terminationReason: screenerTracking.terminationReason,
    responseTimes: alignedResponseTimes,
    analytics: (input.analytics ?? null) as Json | null,
    startedAt,
    submittedAt,
    totalDurationSec,
    ipAddress: options.ipAddress ?? null,
  };

  if (existingResponse) {
    await updateResponse(leadId, responsePayload);
  } else {
    await createResponse({ leadId, ...responsePayload });
  }

  await clearRefillRequest(leadId);

  const eligibility = await determineEligibility(
    leadId,
    options.ipAddress ?? null,
  );

  return {
    submitted: true,
    status: eligibility.status,
    eligible: eligibility.eligible,
  };
}
