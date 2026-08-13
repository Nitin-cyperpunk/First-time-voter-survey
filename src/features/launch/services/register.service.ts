import { ACQUISITION_OTHER, normalizeReferralPlatform } from "@/lib/acquisition";
import {
  buildReferralLink,
  generateUniqueReferralCode,
  normalizeReferralCode,
} from "@/lib/referral-code.service";
import { normalizePhone } from "@/features/referrals/lib/registration";
import type { LaunchRegistrationInput } from "@/features/launch/schemas/registration";
import {
  computeTotalDurationSec,
  hasStoredAnswerValue,
  mapFieldAnswersToQKeys,
  mapFieldTimesToQKeys,
  normalizeStoredAnswers,
  stripInternalAnswerKeys,
  type StoredAnswerValue,
  usesQKeyFormat,
  validateScreenerSubmission,
} from "@/lib/response-storage";
import type { Json } from "@/lib/supabase/types";
import { createReferral } from "@/server/repositories/referrals.repository";
import { createFormTerminations } from "@/server/repositories/form-terminations.repository";
import { checkDuplicateFingerprint } from "@/server/services/duplicate-fingerprint.service";
import {
  buildRegistrationTerminationNotes,
  isRegistrationTerminated,
  resolveScreenerCompletionTracking,
} from "@/lib/registration-terminations";
import { transitionParticipantStatus } from "@/server/services/lifecycle.service";
import {
  createParticipant,
  findByMobile,
  findByReferralCode,
} from "@/server/repositories/participants.repository";
import {
  createResponse,
  getActiveFormVersion,
  hasScreenerResponse,
  assertScreenerNotSubmitted,
} from "@/server/repositories/screener.repository";
import { buildRegistrationThankYouMessages } from "@/server/services/participant-message.service";
import { syncIpDuplicateFlag } from "@/lib/eligibility";
import {
  ageOutOfRangeMessage,
  isAgeWithinStudyRule,
  isRegistrationAccepting,
} from "@/lib/study-config/gates";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";
import { buildResponseExportArtifacts } from "@/lib/form-export/persist-export";
import { normalizeDeviceFingerprint } from "@/lib/device-fingerprint";
import { nestAnswersByQuestion } from "@/lib/survey-export/nest-by-question";
import {
  answersUseLabeledKeys,
  buildLabeledAnswerCsvRow,
  labeledAnswersToQKeyMap,
} from "@/lib/survey-export/question-format";
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

function resolveScreenerCsvRow(input: {
  input: LaunchRegistrationInput;
  form: {
    version: number;
    schema: FormExportSchema;
    htmlContent: string | null;
  };
  storedAnswers: Record<string, StoredAnswerValue>;
  leadId: string;
  participant: { fullName: string; mobile: string; city: string | null };
  totalDurationSec: number | null;
}): Json | null {
  if (input.input.csvRow && Object.keys(input.input.csvRow).length > 0) {
    return input.input.csvRow as Json;
  }

  const schema = input.form.schema;
  if (!schema.fields.length) {
    return null;
  }

  const qKeyAnswers = answersUseLabeledKeys(input.input.answers)
    ? labeledAnswersToQKeyMap(
        input.input.answers as Record<string, StoredAnswerValue>,
        schema,
      )
    : input.storedAnswers;
  const nestedAnswers = nestAnswersByQuestion(qKeyAnswers, schema);
  const metadata = {
    Lead_ID: input.leadId,
    full_name: input.participant.fullName,
    mobile: input.participant.mobile,
    city: input.participant.city ?? "",
    Total_Duration:
      input.totalDurationSec !== null && input.totalDurationSec !== undefined
        ? input.totalDurationSec
        : "",
  };

  if (input.form.htmlContent) {
    const artifacts = buildResponseExportArtifacts({
      schema,
      html: input.form.htmlContent,
      answers: nestedAnswers,
      leadId: input.leadId,
      metadata,
      excludeCoreFields: true,
      respondentIdHeader: "Respondent ID",
    });
    return artifacts.csvRow as Json;
  }

  return buildLabeledAnswerCsvRow({
    nestedAnswers,
    schema,
    metadata,
  }) as Json;
}

export async function registerParticipant(
  input: LaunchRegistrationInput,
  options: { ipAddress?: string | null; userAgent?: string | null },
) {
  const studyConfig = await getStudyConfig();
  if (!isRegistrationAccepting(studyConfig)) {
    throw new Error("SURVEY_CLOSED");
  }

  if (!isAgeWithinStudyRule(input.dob, studyConfig)) {
    throw new Error(`AGE_OUT_OF_RANGE:${ageOutOfRangeMessage(studyConfig)}`);
  }

  const mobile = normalizePhone(input.mobile);

  const existing = await findByMobile(mobile);
  if (existing) {
    throw new Error("DUPLICATE_MOBILE");
  }

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

  for (const [qIndex, field] of form.schema.fields.entries()) {
    const qKey = /^Q\d+$/.test(field.id) ? field.id : `Q${qIndex + 1}`;
    const answerValue = storedAnswers[qKey] ?? normalizedAnswers[field.id];
    if ("required" in field && field.required && !hasStoredAnswerValue(answerValue)) {
      throw new Error(`MISSING_ANSWER:${field.id}`);
    }
  }

  let referrerLeadId: string | null = null;
  let referrerReferralCode: string | null = null;
  if (input.referrerCode?.trim()) {
    const referrer = await findByReferralCode(
      normalizeReferralCode(input.referrerCode),
    );
    if (referrer) {
      referrerLeadId = referrer.leadId;
      referrerReferralCode = referrer.referralCode;
    }
  }

  const isReferral = Boolean(input.referrerCode?.trim());
  const acquisitionType: "direct" | "referral" = isReferral
    ? "referral"
    : "direct";
  const referralPlatform = isReferral
    ? normalizeReferralPlatform(input.referralPlatform)
    : null;

  const rawSource = input.acquisitionSource?.trim() || null;
  const acquisitionSource = rawSource;
  const otherSource =
    rawSource === ACQUISITION_OTHER ? input.otherSource?.trim() || null : null;

  const referralCode = await generateUniqueReferralCode();
  const registrationTerminated = isRegistrationTerminated(input);
  const screenerTracking = resolveScreenerCompletionTracking(input);
  const deviceFingerprint = normalizeDeviceFingerprint(input.deviceFingerprint);

  const participant = await createParticipant({
    referralCode,
    fullName: input.fullName,
    mobile,
    dob: input.dob,
    city: input.city,
    email: input.email?.trim() || null,
    area: input.area?.trim() || null,
    pincode: input.pincode?.trim() || null,
    referredBy: referrerLeadId,
    ipAddress: options.ipAddress ?? null,
    userAgent: options.userAgent ?? null,
    isFlaggedDuplicate: false,
    acquisitionSource,
    acquisitionType,
    referralPlatform,
    otherSource,
    deviceFingerprint,
  });

  await checkDuplicateFingerprint({
    leadId: participant.leadId,
    fingerprint: deviceFingerprint,
    ipAddress: options.ipAddress ?? null,
    userAgent: options.userAgent ?? null,
  });

  try {
    await syncIpDuplicateFlag(participant.leadId, options.ipAddress ?? null);
  } catch (error) {
    console.error("[registerParticipant] syncIpDuplicateFlag failed open:", error);
  }

  if (Object.keys(storedAnswers).length > 0) {
    assertScreenerNotSubmitted(await hasScreenerResponse(participant.leadId));

    const startedAt = input.startedAt ? new Date(input.startedAt) : null;
    const submittedAt = input.submittedAt
      ? new Date(input.submittedAt)
      : new Date();
    const totalDurationSec =
      startedAt !== null
        ? computeTotalDurationSec(startedAt, submittedAt)
        : null;

    await createResponse({
      leadId: participant.leadId,
      mobile: participant.mobile,
      formVersion: form.version,
      answers: withTimingMetadata(storedAnswers, alignedResponseTimes, {
        currentScreen: input.currentScreen,
        lastScreen: input.lastScreen,
      }) as Json,
      completionStatus: screenerTracking.completionStatus,
      terminationReason: screenerTracking.terminationReason,
      responseTimes: alignedResponseTimes,
      analytics: (input.analytics ?? null) as Json | null,
      csvRow: resolveScreenerCsvRow({
        input,
        form,
        storedAnswers,
        leadId: participant.leadId,
        participant,
        totalDurationSec,
      }),
      startedAt,
      submittedAt,
      totalDurationSec,
      ipAddress: options.ipAddress ?? null,
    });
  }

  if (registrationTerminated) {
    await transitionParticipantStatus(participant.leadId, "not_eligible", {
      changedBy: "system",
      notes: buildRegistrationTerminationNotes(input.terminations),
    });
  }

  if (input.terminations?.length) {
    await createFormTerminations(
      input.terminations.map((item) => ({
        leadId: participant.leadId,
        formType: "registration",
        formVersion: form.version,
        ruleKey: item.ruleKey,
        ruleLabel: item.ruleLabel ?? null,
        questionKey: item.questionKey ?? null,
        questionLabel: item.questionLabel ?? null,
        answerValue: item.answerValue ?? null,
        reasonText: item.reasonText ?? null,
        participantStatus: registrationTerminated ? "not_eligible" : participant.status,
        submittedAt: input.submittedAt ? new Date(input.submittedAt) : new Date(),
      })),
    );
  }

  if (referrerLeadId) {
    await createReferral({
      referrerLeadId,
      referredLeadId: participant.leadId,
      referralCode: referrerReferralCode,
    });
  }

  const finalStatus = registrationTerminated ? "not_eligible" : participant.status;
  const messages = await buildRegistrationThankYouMessages(participant);

  return {
    registered: true,
    leadId: participant.leadId,
    fullName: participant.fullName,
    mobile: participant.mobile,
    status: finalStatus,
    eligible: false,
    referralLink: buildReferralLink(participant.referralCode),
    messages,
  };
}
