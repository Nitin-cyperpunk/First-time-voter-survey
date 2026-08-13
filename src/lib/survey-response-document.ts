import type { FormExportSchema } from "@/lib/form-export/types";
import { coerceFormExportSchema } from "@/lib/form-export/coerce-schema";
import { findAnswerForQKey } from "@/lib/survey-export/q-key";
import { nestAnswersByQuestion } from "@/lib/survey-export/nest-by-question";
import {
  answersUseLabeledKeys,
  labeledAnswersToQKeyMap,
} from "@/lib/survey-export/question-format";
import { isQKey } from "@/lib/response-storage";

export type SurveyLeafValue = string | number | boolean | string[] | null;

export type SurveyAnswerValue =
  | SurveyLeafValue
  | Record<string, SurveyLeafValue>
  | Array<Record<string, SurveyLeafValue>>;

export type SurveyJourney = {
  before: unknown[];
  after: unknown[];
};

export type SurveyComparison = {
  brand: string;
  type: string;
  when: string;
};

export type SurveyResponseDocument = {
  respondent_name: string;
  city: string;
  area: string;
  zipcode: string;
  gender: string;
  lead_id: string;
  survey_version: string;
  current_screen: string;
  _last_screen: string;
  _screen_times: Record<string, number>;
  answers: Record<string, SurveyAnswerValue>;
  journey: SurveyJourney;
  comparison: SurveyComparison;
};

const DOCUMENT_METADATA_KEYS = new Set([
  "respondent_name",
  "city",
  "area",
  "zipcode",
  "gender",
  "lead_id",
  "survey_version",
  "current_screen",
  "_last_screen",
  "_screen_times",
  "answers",
  "journey",
  "comparison",
]);

const INTERNAL_ANSWER_KEYS = new Set([
  "_st",
  "_screen_times",
  "_last_screen",
  "_termreason",
  "_endreason",
]);

function isInternalDocumentAnswerKey(key: string): boolean {
  return INTERNAL_ANSWER_KEYS.has(key.toLowerCase());
}

const COMPARISON_FIELD_PATTERNS: Record<keyof SurveyComparison, string[]> = {
  brand: ["brand"],
  type: ["type", "bra_type", "product_type"],
  when: ["when", "lastbuy", "last_purchase", "purchase_when"],
};

export function emptySurveyJourney(): SurveyJourney {
  return { before: [], after: [] };
}

export function emptySurveyComparison(): SurveyComparison {
  return { brand: "", type: "", when: "" };
}

export function isSurveyResponseDocument(
  value: unknown,
): value is SurveyResponseDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    "answers" in record &&
    typeof record.answers === "object" &&
    record.answers !== null &&
    !Array.isArray(record.answers)
  );
}

export function isLegacyFlatAnswerMap(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  if (isSurveyResponseDocument(value)) {
    return false;
  }

  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length === 0) {
    return true;
  }

  return keys.some((key) => isQuestionStorageKey(key));
}

export function isQuestionStorageKey(key: string): boolean {
  return isQKey(key) || /^q\d+$/i.test(key);
}

export function sanitizeSurveyAnswers(
  answers: Record<string, unknown>,
): Record<string, SurveyAnswerValue> {
  const sanitized: Record<string, SurveyAnswerValue> = {};

  for (const [key, value] of Object.entries(answers)) {
    if (DOCUMENT_METADATA_KEYS.has(key)) continue;
    const cleaned = sanitizeAnswerValue(value);
    if (cleaned !== undefined) {
      sanitized[key] = cleaned;
    }
  }

  return sanitized;
}

function sanitizeLeafValue(value: unknown): SurveyLeafValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => String(item).trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function sanitizeAnswerValue(value: unknown): SurveyAnswerValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    if (
      value.length > 0 &&
      typeof value[0] === "object" &&
      value[0] !== null &&
      !Array.isArray(value[0])
    ) {
      const entries: Array<Record<string, SurveyLeafValue>> = [];
      for (const item of value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          continue;
        }

        const record: Record<string, SurveyLeafValue> = {};
        for (const [key, nestedValue] of Object.entries(
          item as Record<string, unknown>,
        )) {
          const cleaned = sanitizeLeafValue(nestedValue);
          if (cleaned !== undefined) {
            record[key] = cleaned;
          }
        }

        if (Object.keys(record).length > 0) {
          entries.push(record);
        }
      }

      return entries.length > 0 ? entries : undefined;
    }

    return sanitizeLeafValue(value);
  }

  if (typeof value === "object") {
    const nested: Record<string, SurveyLeafValue> = {};
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const cleaned = sanitizeLeafValue(nestedValue);
      if (cleaned !== undefined) {
        nested[key] = cleaned;
      }
    }
    return Object.keys(nested).length > 0 ? nested : undefined;
  }

  return sanitizeLeafValue(value);
}

export function extractQuestionAnswers(
  raw: unknown,
): Record<string, SurveyAnswerValue> {
  if (isSurveyResponseDocument(raw)) {
    const answers: Record<string, SurveyAnswerValue> = {};
    for (const [key, value] of Object.entries(raw.answers ?? {})) {
      if (isInternalDocumentAnswerKey(key)) continue;
      answers[key] = value as SurveyAnswerValue;
    }
    return answers;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const record = raw as Record<string, unknown>;
  const answers: Record<string, SurveyAnswerValue> = {};

  for (const [key, value] of Object.entries(record)) {
    if (DOCUMENT_METADATA_KEYS.has(key)) continue;
    if (!isQuestionStorageKey(key) && !/^Q\d+\.\s/.test(key)) continue;
    const cleaned = sanitizeAnswerValue(value);
    if (cleaned !== undefined) {
      answers[key] = cleaned;
    }
  }

  return answers;
}

export function extractScreenTimes(
  raw: unknown,
  legacyColumn?: unknown,
): Record<string, number> {
  if (isSurveyResponseDocument(raw)) {
    return { ...raw._screen_times };
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const embedded = record._screen_times;
    if (embedded && typeof embedded === "object" && !Array.isArray(embedded)) {
      return normalizeScreenTimes(embedded as Record<string, unknown>);
    }
  }

  if (
    legacyColumn &&
    typeof legacyColumn === "object" &&
    !Array.isArray(legacyColumn)
  ) {
    return normalizeScreenTimes(legacyColumn as Record<string, unknown>);
  }

  return {};
}

function normalizeScreenTimes(
  value: Record<string, unknown>,
): Record<string, number> {
  const times: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
      times[key] = raw;
    }
  }
  return times;
}

export function normalizeSurveyResponseDocument(
  raw: unknown,
  options?: {
    legacyResponseTimes?: unknown;
  },
): SurveyResponseDocument {
  if (isSurveyResponseDocument(raw)) {
    return {
      respondent_name: String(raw.respondent_name ?? ""),
      city: String(raw.city ?? ""),
      area: String(raw.area ?? ""),
      zipcode: String(raw.zipcode ?? ""),
      gender: String(raw.gender ?? ""),
      lead_id: String(raw.lead_id ?? ""),
      survey_version: String(raw.survey_version ?? ""),
      current_screen: String(raw.current_screen ?? ""),
      _last_screen: String(raw._last_screen ?? ""),
      _screen_times: extractScreenTimes(raw, options?.legacyResponseTimes),
      answers: sanitizeSurveyAnswers(
        raw.answers as Record<string, unknown>,
      ),
      journey: {
        before: Array.isArray(raw.journey?.before) ? [...raw.journey.before] : [],
        after: Array.isArray(raw.journey?.after) ? [...raw.journey.after] : [],
      },
      comparison: {
        brand: String(raw.comparison?.brand ?? ""),
        type: String(raw.comparison?.type ?? ""),
        when: String(raw.comparison?.when ?? ""),
      },
    };
  }

  const legacyAnswers = extractQuestionAnswers(raw);
  const legacyRecord =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  return {
    respondent_name: String(legacyRecord.respondent_name ?? ""),
    city: String(legacyRecord.city ?? ""),
    area: String(legacyRecord.area ?? ""),
    zipcode: String(legacyRecord.zipcode ?? legacyRecord.zip ?? ""),
    gender: String(legacyRecord.gender ?? ""),
    lead_id: String(legacyRecord.lead_id ?? ""),
    survey_version: String(legacyRecord.survey_version ?? ""),
    current_screen: String(legacyRecord.current_screen ?? ""),
    _last_screen: String(legacyRecord._last_screen ?? ""),
    _screen_times: extractScreenTimes(raw, options?.legacyResponseTimes),
    answers: legacyAnswers,
    journey: emptySurveyJourney(),
    comparison: emptySurveyComparison(),
  };
}

function pickMetadataFromScreener(
  screenerAnswers: Record<string, unknown> | null | undefined,
  schema: FormExportSchema | null | undefined,
  patterns: string[],
): string {
  if (!screenerAnswers) return "";

  const exportSchema = schema ? coerceFormExportSchema(schema) : null;
  if (exportSchema && exportSchema.fields.length > 0) {
    for (const field of exportSchema.fields) {
      const token = `${field.fieldName ?? field.id}`.toLowerCase();
      if (!patterns.some((pattern) => token.includes(pattern))) {
        continue;
      }
      const value =
        screenerAnswers[field.qKey] ??
        screenerAnswers[field.id] ??
        (field.fieldName ? screenerAnswers[field.fieldName] : undefined);
      if (value !== undefined && value !== null && value !== "") {
        return Array.isArray(value) ? value.join(", ") : String(value);
      }
    }
  }

  for (const [key, value] of Object.entries(screenerAnswers)) {
    const token = key.toLowerCase();
    if (!patterns.some((pattern) => token.includes(pattern))) {
      continue;
    }
    if (value !== undefined && value !== null && value !== "") {
      return Array.isArray(value) ? value.join(", ") : String(value);
    }
  }

  return "";
}

export function buildComparisonFromAnswers(
  answers: Record<string, SurveyAnswerValue>,
  schema?: FormExportSchema | null,
): SurveyComparison {
  const comparison = emptySurveyComparison();
  const exportSchema = schema ? coerceFormExportSchema(schema) : null;

  if (exportSchema && exportSchema.fields.length > 0) {
    for (const field of exportSchema.fields) {
      const token = `${field.fieldName ?? field.id}`.toLowerCase();
      for (const [slot, patterns] of Object.entries(
        COMPARISON_FIELD_PATTERNS,
      ) as Array<[keyof SurveyComparison, string[]]>) {
        if (!patterns.some((pattern) => token.includes(pattern))) {
          continue;
        }
        const value = findAnswerForQKey(answers, field.qKey);
        if (value !== undefined && value !== null && value !== "" && !comparison[slot]) {
          comparison[slot] = Array.isArray(value)
            ? value.join(", ")
            : typeof value === "object"
              ? JSON.stringify(value)
              : String(value);
        }
      }
    }
  }

  for (const [key, value] of Object.entries(answers)) {
    const token = key.toLowerCase();
    for (const [slot, patterns] of Object.entries(
      COMPARISON_FIELD_PATTERNS,
    ) as Array<[keyof SurveyComparison, string[]]>) {
      if (!patterns.some((pattern) => token.includes(pattern))) {
        continue;
      }
      if (value !== undefined && value !== null && value !== "" && !comparison[slot]) {
        comparison[slot] = Array.isArray(value)
          ? value.join(", ")
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
      }
    }
  }

  return comparison;
}

export function inferLastScreen(
  screenTimes: Record<string, number>,
  currentScreen?: string,
): string {
  if (currentScreen?.trim()) {
    return currentScreen.trim();
  }

  const qKeys = Object.keys(screenTimes).filter(isQuestionStorageKey);
  if (qKeys.length === 0) {
    return "";
  }

  return qKeys.sort((left, right) => {
    const leftNum = Number.parseInt(left.replace(/\D/g, ""), 10);
    const rightNum = Number.parseInt(right.replace(/\D/g, ""), 10);
    if (Number.isNaN(leftNum) || Number.isNaN(rightNum)) {
      return right.localeCompare(left);
    }
    return rightNum - leftNum;
  })[0]!;
}

export function buildSurveyResponseDocument(input: {
  leadId: string;
  participant: { fullName: string; city: string | null };
  screenerAnswers?: Record<string, unknown> | null;
  screenerSchema?: FormExportSchema | null;
  surveyVersion?: string | number | null;
  answers: Record<string, unknown>;
  screenTimes?: Record<string, number>;
  currentScreen?: string;
  lastScreen?: string;
  surveySchema?: FormExportSchema | null;
}): SurveyResponseDocument {
  const exportSchema = input.surveySchema
    ? coerceFormExportSchema(input.surveySchema)
    : null;

  const rawAnswers = input.answers as Record<string, unknown>;
  const qKeyAnswers = exportSchema && answersUseLabeledKeys(rawAnswers)
    ? labeledAnswersToQKeyMap(
        sanitizeSurveyAnswers(rawAnswers),
        exportSchema,
      )
    : sanitizeSurveyAnswers(rawAnswers);

  const nestedAnswers = exportSchema
    ? nestAnswersByQuestion(qKeyAnswers, exportSchema)
    : qKeyAnswers;
  // Keep Q-key / field-name answers (screener-style), not labeled-only headers.
  const sanitizedAnswers = sanitizeSurveyAnswers(nestedAnswers);
  const screenTimes = normalizeScreenTimes(
    (input.screenTimes ?? {}) as Record<string, unknown>,
  );
  // Checklist shape: answers._st mirrors document-level _screen_times.
  if (Object.keys(screenTimes).length > 0) {
    (sanitizedAnswers as Record<string, SurveyAnswerValue>)._st =
      screenTimes as unknown as SurveyAnswerValue;
  }
  const currentScreen = String(input.currentScreen ?? "").trim();
  const lastScreen =
    String(input.lastScreen ?? "").trim() ||
    inferLastScreen(screenTimes, currentScreen);
  const surveyVersion =
    input.surveyVersion === null || input.surveyVersion === undefined
      ? ""
      : String(input.surveyVersion).startsWith("v")
        ? String(input.surveyVersion)
        : `v${input.surveyVersion}`;

  const area = pickMetadataFromScreener(
    input.screenerAnswers,
    input.screenerSchema,
    ["area"],
  );
  const zipcode = pickMetadataFromScreener(
    input.screenerAnswers,
    input.screenerSchema,
    ["zip", "zipcode", "pin"],
  );
  const gender = pickMetadataFromScreener(
    input.screenerAnswers,
    input.screenerSchema,
    ["gender"],
  );

  return {
    respondent_name: input.participant.fullName,
    city: input.participant.city ?? "",
    area,
    zipcode,
    gender,
    lead_id: input.leadId,
    survey_version: surveyVersion,
    current_screen: currentScreen,
    _last_screen: lastScreen,
    _screen_times: screenTimes,
    answers: sanitizedAnswers,
    journey: emptySurveyJourney(),
    comparison: buildComparisonFromAnswers(
      nestedAnswers,
      input.surveySchema,
    ),
  };
}

export function toValidationAnswerMap(
  answers: Record<string, SurveyAnswerValue>,
): Record<string, string> {
  const flattened: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      flattened[key] = value.join(", ");
      continue;
    }
    if (typeof value === "object") {
      flattened[key] = JSON.stringify(value);
      continue;
    }
    flattened[key] = String(value);
  }
  return flattened;
}
