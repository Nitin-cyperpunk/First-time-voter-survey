import { canAccessSurvey, toSurveyAccessFields } from "@/lib/eligibility";
import type { Json } from "@/lib/supabase/types";
import {
  computeTotalDurationSec,
  isQKey,
  mapFieldAnswersToQKeys,
  stripInternalAnswerKeys,
  usesQKeyFormat,
  validateScreenerSubmission,
  type StoredAnswerValue,
} from "@/lib/response-storage";
import type { FormExportSchema } from "@/lib/form-export/types";
import {
  EVERYDAY_BRA_WIDE_COLUMN_COUNT,
  mapEverydayBraAnswersToWideRow,
  type EverydayBraWideMeta,
} from "@/lib/survey-export/everyday-bra-wide";
import {
  buildSurveyResponseDocument,
  extractQuestionAnswers,
  extractScreenTimes,
  sanitizeSurveyAnswers,
  toValidationAnswerMap,
  type SurveyAnswerValue,
} from "@/lib/survey-response-document";
import { nestAnswersByQuestion } from "@/lib/survey-export/nest-by-question";
import { normalizeSurveyResponseTimes } from "@/lib/survey-export/normalize-response-times";
import {
  answersUseLabeledKeys,
  labeledAnswersToQKeyMap,
} from "@/lib/survey-export/question-format";
import { formatExportDate } from "@/lib/survey-export/format-value";
import {
  assertSurveyNotSubmitted,
  createSurveyResponse,
  hasSurveyResponse,
} from "@/server/repositories/survey.repository";
import { getScreenerResponse } from "@/server/repositories/screener.repository";
import { getActivePublishedForm } from "@/server/repositories/forms.repository";
import { findParticipantByLeadId } from "@/server/repositories/participants.repository";
import { transitionParticipantStatus } from "@/server/services/lifecycle.service";
import {
  getPublishedFormVersion,
  resolveSchemaForFormVersion,
} from "@/server/services/form-export.service";

export type SurveySubmissionInput = {
  answers: Record<string, unknown>;
  answerJson?: Record<string, unknown>;
  csvRow?: Record<string, string | number>;
  responseTimes?: Record<string, number>;
  analytics?: Record<string, unknown>;
  startedAt?: string;
  submittedAt?: string;
  currentScreen?: string;
  lastScreen?: string;
};

function toStoredAnswerMap(
  answers: Record<string, unknown>,
): Record<string, StoredAnswerValue> {
  const out: Record<string, StoredAnswerValue> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      out[key] = value.map(String);
    } else if (typeof value === "string" || typeof value === "number") {
      out[key] = String(value);
    } else if (typeof value === "boolean") {
      out[key] = value ? "true" : "false";
    }
    // objects (nested matrix/repeat) are handled after nestAnswersByQuestion
  }
  return out;
}

function resolveSurveyQKeyAnswers(
  submissionAnswers: Record<string, unknown>,
  schema: FormExportSchema | null,
): Record<string, unknown> {
  if (!schema) return submissionAnswers;

  if (answersUseLabeledKeys(submissionAnswers)) {
    return labeledAnswersToQKeyMap(
      submissionAnswers as Record<string, SurveyAnswerValue>,
      schema,
    );
  }

  if (usesQKeyFormat(submissionAnswers)) {
    return submissionAnswers;
  }

  const flat = toStoredAnswerMap(submissionAnswers);
  const mapped = mapFieldAnswersToQKeys(flat, schema);
  // Keep unmapped field names (dynamic inputs) so they are not dropped.
  return { ...submissionAnswers, ...mapped };
}

function resolveSurveyNormalizedExport(input: {
  csvRow?: Record<string, string | number>;
  rawAnswers: Record<string, unknown>;
  leadId: string;
  surveyVersion: string;
  startedAt: Date | null;
  submittedAt: Date;
  totalDurationSec: number | null;
  lastScreen?: string;
}): Json {
  // Only trust a client csvRow when it already matches the wide contract.
  if (
    input.csvRow &&
    Object.keys(input.csvRow).length === EVERYDAY_BRA_WIDE_COLUMN_COUNT &&
    "Respondent ID" in input.csvRow
  ) {
    return input.csvRow as Json;
  }

  const consent = String(
    input.rawAnswers.consent ?? "",
  ).trim().toLowerCase();
  const status: EverydayBraWideMeta["status"] =
    consent === "no" ? "consent_declined" : "complete";

  const durationMinutes =
    input.totalDurationSec !== null && input.totalDurationSec !== undefined
      ? Math.round((input.totalDurationSec / 60) * 10) / 10
      : "";

  const meta: EverydayBraWideMeta = {
    leadId: input.leadId,
    status,
    surveyVersion: input.surveyVersion,
    startedAt: input.startedAt
      ? formatExportDate(input.startedAt.toISOString())
      : "",
    completedAt: formatExportDate(input.submittedAt.toISOString()),
    durationMinutes,
    lastScreenReached: input.lastScreen ?? "",
    q16q17TabOrder: String(
      input.rawAnswers.q16q17_tab_order ??
        input.rawAnswers.stmt_tab_order ??
        "",
    ),
    q22TabOrder: String(
      input.rawAnswers.q22_tab_order ?? input.rawAnswers.wtp_tab_order ?? "",
    ),
  };

  return mapEverydayBraAnswersToWideRow(input.rawAnswers, meta) as Json;
}

export async function submitSurvey(
  leadId: string,
  input: SurveySubmissionInput,
) {
  const participant = await findParticipantByLeadId(leadId);
  if (!participant) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  if (!canAccessSurvey(toSurveyAccessFields(participant))) {
    throw new Error("NOT_ELIGIBLE");
  }

  const alreadySubmitted = await hasSurveyResponse(leadId);
  assertSurveyNotSubmitted(alreadySubmitted);

  const [activeForm, screenerResponse] = await Promise.all([
    getActivePublishedForm("survey"),
    getScreenerResponse(leadId),
  ]);

  const resolvedSurveySchema = activeForm?.schema ?? null;

  const submissionAnswers =
    input.answerJson && Object.keys(input.answerJson).length > 0
      ? input.answerJson
      : input.answers;

  const qKeyAnswers = resolveSurveyQKeyAnswers(
    submissionAnswers,
    resolvedSurveySchema,
  );

  const nestedAnswers = resolvedSurveySchema
    ? nestAnswersByQuestion(qKeyAnswers, resolvedSurveySchema)
    : qKeyAnswers;
  const sanitizedAnswers = sanitizeSurveyAnswers(nestedAnswers);
  // Drop embedded timing metadata before Q-key/time validation.
  const validationAnswers = stripInternalAnswerKeys(
    sanitizedAnswers as Record<string, unknown>,
  ) as Record<string, SurveyAnswerValue>;
  const validationAnswerMap = toValidationAnswerMap(validationAnswers);
  // Strict timing validation only applies to Q-keys (field-name leftovers are kept
  // in answers jsonb but are not required to pair 1:1 with response times).
  const qKeyValidationMap = Object.fromEntries(
    Object.entries(validationAnswerMap).filter(([key]) => isQKey(key)),
  );
  const normalizedResponseTimes = normalizeSurveyResponseTimes(
    input.responseTimes,
    Object.keys(qKeyValidationMap),
    resolvedSurveySchema,
  );
  const validation = validateScreenerSubmission(
    qKeyValidationMap,
    normalizedResponseTimes,
  );
  if (!validation.ok) {
    throw new Error(`INVALID_RESPONSE:${validation.error}`);
  }

  const screenerFormVersion = screenerResponse?.form_version
    ? await getPublishedFormVersion(
        "registration",
        screenerResponse.form_version,
      )
    : null;
  const screenerSchema = screenerFormVersion
    ? resolveSchemaForFormVersion(screenerFormVersion)
    : null;

  const document = buildSurveyResponseDocument({
    leadId,
    participant: {
      fullName: participant.fullName,
      city: participant.city,
    },
    screenerAnswers: extractQuestionAnswers(screenerResponse?.answers ?? {}),
    screenerSchema,
    surveyVersion: activeForm?.version ?? null,
    answers: sanitizedAnswers,
    screenTimes: normalizedResponseTimes,
    currentScreen: input.currentScreen,
    lastScreen: input.lastScreen,
    surveySchema: resolvedSurveySchema,
  });

  const startedAt = input.startedAt ? new Date(input.startedAt) : null;
  const submittedAt = input.submittedAt
    ? new Date(input.submittedAt)
    : new Date();
  const totalDurationSec =
    startedAt !== null
      ? computeTotalDurationSec(startedAt, submittedAt)
      : null;

  const normalizedExport = resolveSurveyNormalizedExport({
    csvRow: input.csvRow,
    rawAnswers: submissionAnswers as Record<string, unknown>,
    leadId,
    surveyVersion: activeForm?.version
      ? `v${activeForm.version}`
      : "",
    startedAt,
    submittedAt,
    totalDurationSec,
    lastScreen: input.lastScreen ?? input.currentScreen,
  });

  const response = await createSurveyResponse({
    leadId,
    formVersion: activeForm?.version ?? null,
    answers: document as unknown as Json,
    responseTimes: document._screen_times as Json,
    analytics: (input.analytics ?? null) as Json | null,
    normalizedExport,
    startedAt,
    submittedAt,
    totalDurationSec,
  });

  await transitionParticipantStatus(leadId, "completed", {
    changedBy: "participant",
    notes: "Main survey submitted",
  });

  return response;
}

export function readSurveyQuestionAnswers(
  rawAnswers: unknown,
  legacyResponseTimes?: Record<string, number> | null,
) {
  return {
    answers: extractQuestionAnswers(rawAnswers),
    responseTimes: extractScreenTimes(rawAnswers, legacyResponseTimes),
  };
}
