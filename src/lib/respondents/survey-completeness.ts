/**
 * Single definition: does this qualified completion have usable survey data?
 * Used by QC auto rules, deliverable clean count, payout, and export.
 *
 * Prefer persisted participants.survey_data_incomplete when set (preserves history).
 * Fall back to live detection from screener + ftv payload when flag is absent.
 */

export type SurveyCompletenessInput = {
  status: string;
  surveyDataIncomplete?: boolean | null;
  screenerAnswers?: Record<string, unknown> | null;
  screenerAnalytics?: Record<string, unknown> | null;
  ftvPayload?: Record<string, unknown> | null;
};

function isAnswersEmpty(answers: Record<string, unknown> | null | undefined): boolean {
  if (answers == null) return true;
  const t = JSON.stringify(answers);
  return t === "{}" || t === "null" || t === '""';
}

function payloadAnswerCount(source: Record<string, unknown> | null | undefined): number {
  if (!source || typeof source !== "object") return 0;
  const nested = (source.__ftv_payload ?? source) as Record<string, unknown>;
  const responses = nested.responses;
  if (!Array.isArray(responses)) return 0;
  return responses.filter(
    (r: { qid?: string; answer?: unknown; answer_code?: unknown }) =>
      r && r.qid && (r.answer != null || r.answer_code != null),
  ).length;
}

/** Live detection — empty screener answers and zero answered FTV payload items. */
export function detectSurveyDataIncomplete(input: SurveyCompletenessInput): boolean {
  const emptyAns = isAnswersEmpty(input.screenerAnswers ?? null);
  const surveyItems = Math.max(
    payloadAnswerCount(input.screenerAnalytics ?? null),
    payloadAnswerCount(input.ftvPayload ?? null),
  );
  return emptyAns && surveyItems === 0;
}

export function isSurveyDataIncomplete(input: SurveyCompletenessInput): boolean {
  if (input.surveyDataIncomplete === true) return true;
  const hasLiveContext =
    input.screenerAnswers !== undefined ||
    input.screenerAnalytics !== undefined ||
    input.ftvPayload !== undefined;
  if (hasLiveContext) return detectSurveyDataIncomplete(input);
  return false;
}

/**
 * True when survey answers are present enough to count as a real complete.
 * Explicit flag wins; live detection runs when screener/FTV context is available.
 */
export function isSurveyDataComplete(input: SurveyCompletenessInput): boolean {
  return !isSurveyDataIncomplete(input);
}
