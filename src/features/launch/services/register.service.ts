import { ACQUISITION_OTHER, normalizeReferralPlatform } from "@/lib/acquisition";
import {
  buildReferralLink,
  generateUniqueReferralCode,
  normalizeReferralCode,
} from "@/lib/referral-code.service";
import { normalizePhone } from "@/features/referrals/lib/registration";
import type { LaunchRegistrationInput } from "@/features/launch/schemas/registration";
import {
  buildScreenerCsvExportRow,
  computeTotalDurationSec,
  formatStoredAnswerValue,
  hasStoredAnswerValue,
  isQKey,
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
  createReferral,
  markReferralEarnedForReferredLeadId,
} from "@/server/repositories/referrals.repository";
import { createFormTerminations } from "@/server/repositories/form-terminations.repository";
import { checkDuplicateFingerprint } from "@/server/services/duplicate-fingerprint.service";
import {
  buildRegistrationTerminationNotes,
  isRegistrationTerminated,
  resolveScreenerCompletionTracking,
} from "@/lib/registration-terminations";
import { CapacityError } from "@/lib/capacity";
import { getCityById } from "@/server/repositories/cities.repository";
import {
  createParticipant,
  deleteParticipantByLeadId,
  findByMobile,
  findByReferralCode,
  recordParticipantStatusHistory,
} from "@/server/repositories/participants.repository";
import { persistFtvAnalysisResponse } from "@/server/repositories/ftv-responses.repository";
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
  isAgeBandWithinStudyRule,
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
    if (!isQKey(key)) continue;
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

function csvFromStoredAnswers(input: {
  storedAnswers: Record<string, StoredAnswerValue>;
  responseTimes?: Record<string, number> | null;
  leadId: string;
  participant: { fullName: string; mobile: string; city: string | null };
  totalDurationSec: number | null;
}): Json {
  const questionAnswers = Object.fromEntries(
    Object.entries(
      stripInternalAnswerKeys(input.storedAnswers as Record<string, unknown>),
    )
      .filter(([key]) => isQKey(key))
      .map(([key, value]) => [key, formatStoredAnswerValue(value)]),
  );

  return buildScreenerCsvExportRow({
    leadId: input.leadId,
    fullName: input.participant.fullName,
    mobile: input.participant.mobile,
    city: input.participant.city,
    answers: questionAnswers,
    responseTimes: input.responseTimes,
    totalDurationSec: input.totalDurationSec,
  }) as Json;
}

function csvRowHasQuestionValues(row: Record<string, string | number>): boolean {
  const skip = new Set([
    "Lead_ID",
    "full_name",
    "mobile",
    "city",
    "Total_Duration",
    "Respondent ID",
  ]);
  return Object.entries(row).some(
    ([key, value]) => !skip.has(key) && String(value).trim().length > 0,
  );
}

function resolveScreenerCsvRow(input: {
  input: LaunchRegistrationInput;
  form: {
    version: number;
    schema: FormExportSchema;
    htmlContent: string | null;
  };
  storedAnswers: Record<string, StoredAnswerValue>;
  responseTimes?: Record<string, number> | null;
  leadId: string;
  participant: { fullName: string; mobile: string; city: string | null };
  totalDurationSec: number | null;
}): Json | null {
  if (input.input.csvRow && Object.keys(input.input.csvRow).length > 0) {
    return input.input.csvRow as Json;
  }

  const fallback = () => csvFromStoredAnswers(input);

  const schema = input.form.schema;
  if (!schema.fields.length) {
    return fallback();
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

  const schemaRow = (
    input.form.htmlContent
      ? buildResponseExportArtifacts({
          schema,
          html: input.form.htmlContent,
          answers: nestedAnswers,
          leadId: input.leadId,
          metadata,
          excludeCoreFields: true,
          respondentIdHeader: "Respondent ID",
        }).csvRow
      : buildLabeledAnswerCsvRow({
          nestedAnswers,
          schema,
          metadata,
        })
  ) as Record<string, string | number>;

  if (!csvRowHasQuestionValues(schemaRow)) {
    return fallback();
  }

  return schemaRow as Json;
}

export async function registerParticipant(
  input: LaunchRegistrationInput,
  options: { ipAddress?: string | null; userAgent?: string | null },
) {
  const studyConfig = await getStudyConfig();
  if (!isRegistrationAccepting(studyConfig)) {
    throw new CapacityError("form_closed");
  }

  if (!isAgeBandWithinStudyRule(input.age_band, studyConfig)) {
    throw new Error(`AGE_OUT_OF_RANGE:${ageOutOfRangeMessage(studyConfig)}`);
  }

  const mobile = input.mobile?.trim() ? normalizePhone(input.mobile) : "";

  if (mobile) {
    const existing = await findByMobile(mobile);
    if (existing) {
      throw new Error("DUPLICATE_MOBILE");
    }
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
    const qKey = isQKey(field.id) ? field.id : `Q${qIndex + 1}`;
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

  if (!input.city_id) {
    throw new CapacityError("city_required");
  }
  const city = await getCityById(input.city_id);
  if (!city || !city.isActive) {
    throw new CapacityError("city_inactive");
  }

  const referralCode = await generateUniqueReferralCode();
  const registrationTerminated = isRegistrationTerminated(input);
  const screenerTracking = resolveScreenerCompletionTracking(input);
  const deviceFingerprint = normalizeDeviceFingerprint(input.deviceFingerprint);

  const finalStatus = registrationTerminated ? "terminated" : "completed";

  const participant = await createParticipant({
    referralCode,
    fullName: input.fullName?.trim() || "Anonymous",
    mobile: mobile || null,
    dob: input.dob?.trim() || null,
    ageBand: input.age_band,
    city: city.name,
    cityId: city.id,
    email: input.email?.trim() || null,
    area: input.area?.trim() || null,
    pincode: input.pincode?.trim() || null,
    status: finalStatus,
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

  await recordParticipantStatusHistory(participant.leadId, finalStatus, {
    changedBy: "system",
    notes: registrationTerminated
      ? buildRegistrationTerminationNotes(input.terminations)
      : "Qualified form completion",
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

  const startedAt = input.startedAt ? new Date(input.startedAt) : null;
  const submittedAt = input.submittedAt
    ? new Date(input.submittedAt)
    : new Date();
  const totalDurationSec =
    startedAt !== null
      ? computeTotalDurationSec(startedAt, submittedAt)
      : null;

  let screenerInserted = false;
  if (Object.keys(storedAnswers).length > 0) {
    assertScreenerNotSubmitted(await hasScreenerResponse(participant.leadId));

    try {
      await createResponse({
        leadId: participant.leadId,
        mobile: participant.mobile || null,
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
          responseTimes: alignedResponseTimes,
          leadId: participant.leadId,
          participant,
          totalDurationSec,
        }),
        startedAt,
        submittedAt,
        totalDurationSec,
        ipAddress: options.ipAddress ?? null,
        cityId: city.id,
      });
      screenerInserted = true;
    } catch (error) {
      if (error instanceof CapacityError) {
        try {
          await deleteParticipantByLeadId(participant.leadId);
        } catch (cleanupError) {
          console.error(
            "[registerParticipant] failed to roll back participant after capacity reject:",
            cleanupError,
          );
        }
      }
      throw error;
    }
  }

  try {
    await persistFtvAnalysisResponse({
      answerJson: input.answerJson ?? null,
      terminated: registrationTerminated,
      terminations: input.terminations,
      leadId: participant.leadId,
      cityId: city.id,
      startedAt,
      submittedAt,
      totalDurationSec,
      screenerInserted,
    });
  } catch (error) {
    console.error("[registerParticipant] ftv_responses dual-write failed:", error);
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
        participantStatus: finalStatus,
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
    if (!registrationTerminated) {
      await markReferralEarnedForReferredLeadId(participant.leadId);
    }
  }

  const messages = await buildRegistrationThankYouMessages(participant);

  return {
    registered: true,
    leadId: participant.leadId,
    fullName: participant.fullName,
    mobile: participant.mobile,
    status: finalStatus,
    eligible: !registrationTerminated,
    referralLink: buildReferralLink(participant.referralCode),
    messages,
  };
}
