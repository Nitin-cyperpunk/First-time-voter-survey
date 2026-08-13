import type { FormExportSchema } from "@/lib/form-export/types";
import type { ScreenerSchema } from "@/types/domain";

type StoredAnswerSchema = ScreenerSchema | FormExportSchema;
import {
  buildFieldNameToQKeyMapFromSchema,
  coerceFormExportSchema,
} from "@/lib/form-export";

/** FTV + numbered keys: Q1, QC, QD, Q15_1, Q6a_1, Q7_rank1. Leading Q is required. */
const Q_KEY_PATTERN = /^Q[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/;
const INTERNAL_ANSWER_KEYS = new Set([
  "_st",
  "_screen_times",
  "_last_screen",
  "_termreason",
  "_endreason",
  "__ftv_payload",
]);

export type StoredAnswerValue = string | string[];

function isInternalAnswerKey(key: string): boolean {
  return INTERNAL_ANSWER_KEYS.has(key.toLowerCase());
}

export function stripInternalAnswerKeys<T extends Record<string, unknown>>(
  answers: T,
): T {
  const cleaned = { ...answers };
  for (const key of Object.keys(cleaned)) {
    if (isInternalAnswerKey(key)) {
      delete cleaned[key];
    }
  }
  return cleaned;
}

export function normalizeStoredAnswers(
  answers: Record<string, string | string[]>,
): Record<string, StoredAnswerValue> {
  return Object.fromEntries(
    Object.entries(answers).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.map(String).map((part) => part.trim()).filter(Boolean)
        : value,
    ]),
  );
}

export function hasStoredAnswerValue(
  value: StoredAnswerValue | undefined,
): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return value.trim().length > 0;
}

export function formatStoredAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

export function isQKey(key: string): boolean {
  return Q_KEY_PATTERN.test(key);
}

export function usesQKeyFormat(answers: Record<string, unknown>): boolean {
  return Object.keys(answers).some(isQKey);
}

export function sortQKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const aLetterOnly = /^Q[A-Z]+$/.test(a);
    const bLetterOnly = /^Q[A-Z]+$/.test(b);
    if (aLetterOnly !== bLetterOnly) return aLetterOnly ? -1 : 1;

    const aNum = Number.parseInt(a.replace(/^Q(?=\d)/, ""), 10);
    const bNum = Number.parseInt(b.replace(/^Q(?=\d)/, ""), 10);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) {
      return aNum - bNum;
    }
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
}

export type ResponseValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateResponseTimes(
  responseTimes: Record<string, number>,
): ResponseValidationResult {
  for (const [key, value] of Object.entries(responseTimes)) {
    if (!isQKey(key)) {
      return { ok: false, error: `Invalid response time key: ${key}` };
    }
    if (!Number.isInteger(value) || value < 0) {
      return {
        ok: false,
        error: `Response time for ${key} must be a non-negative integer (seconds).`,
      };
    }
  }
  return { ok: true };
}

export function validateAnswerTimeKeyMatch(
  answers: Record<string, StoredAnswerValue>,
  responseTimes: Record<string, number>,
): ResponseValidationResult {
  const answerKeys = new Set(
    Object.keys(answers).filter(
      (key) => isQKey(key) && !isInternalAnswerKey(key),
    ),
  );
  const timeKeys = new Set(
    Object.keys(responseTimes).filter(
      (key) => isQKey(key) && !isInternalAnswerKey(key),
    ),
  );

  if (answerKeys.size !== timeKeys.size) {
    return {
      ok: false,
      error: "Every answer key must have a matching response_time key.",
    };
  }

  for (const key of answerKeys) {
    if (!timeKeys.has(key)) {
      return {
        ok: false,
        error: `Missing response time for answer key ${key}.`,
      };
    }
  }

  return { ok: true };
}

export function validateScreenerSubmission(
  answers: Record<string, StoredAnswerValue>,
  responseTimes?: Record<string, number>,
): ResponseValidationResult {
  if (!usesQKeyFormat(answers)) {
    return { ok: true };
  }

  if (!responseTimes || Object.keys(responseTimes).length === 0) {
    return {
      ok: false,
      error: "response_times is required when answers use Q-key format.",
    };
  }

  const qTimes = Object.fromEntries(
    Object.entries(responseTimes).filter(([key]) => isQKey(key)),
  );
  if (Object.keys(qTimes).length === 0) {
    return validateResponseTimes(responseTimes);
  }

  const timeValidation = validateResponseTimes(qTimes);
  if (!timeValidation.ok) return timeValidation;

  return validateAnswerTimeKeyMatch(answers, qTimes);
}

export function computeTotalDurationSec(
  startedAt: Date,
  submittedAt: Date,
): number {
  const ms = submittedAt.getTime() - startedAt.getTime();
  return Math.max(0, Math.round(ms / 1000));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return `${minutes} min`;
  return `${minutes} min ${remainder} sec`;
}

export function formatResponseTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  return `${seconds} sec`;
}

export function buildQuestionLabelMap(
  schema: ScreenerSchema | null | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!schema?.fields?.length) return map;

  schema.fields.forEach((field, index) => {
    const qKey = isQKey(field.id) ? field.id : `Q${index + 1}`;
    map.set(qKey, field.label);
    if (field.id !== qKey) {
      map.set(field.id, field.label);
    }
  });

  return map;
}

export type ResponseDisplayRow = {
  questionKey: string;
  label: string;
  answer: string;
  timeSec: number | null;
};

export function buildResponseDisplayRows(
  answers: Record<string, unknown>,
  responseTimes: Record<string, number> | null | undefined,
  schema: ScreenerSchema | null | undefined,
): ResponseDisplayRow[] {
  const labelMap = buildQuestionLabelMap(schema);
  const keys = sortQKeys(Object.keys(answers));

  return keys.map((key) => ({
    questionKey: key,
    label: labelMap.get(key) ?? (usesQKeyFormat(answers) ? key : key),
    answer: formatStoredAnswerValue(answers[key]),
    timeSec: responseTimes?.[key] ?? null,
  }));
}

export function buildLegacyDisplayRows(
  answers: Record<string, unknown>,
  responseTimes?: Record<string, number> | null,
): ResponseDisplayRow[] {
  return Object.entries(answers).map(([key, value]) => ({
    questionKey: key,
    label: key,
    answer: formatStoredAnswerValue(value),
    timeSec: responseTimes?.[key] ?? null,
  }));
}

export function buildResponseDisplay(
  answers: Record<string, unknown>,
  responseTimes: Record<string, number> | null | undefined,
  schema: ScreenerSchema | null | undefined,
): ResponseDisplayRow[] {
  if (usesQKeyFormat(answers)) {
    return buildResponseDisplayRows(answers, responseTimes, schema);
  }
  return buildLegacyDisplayRows(answers, responseTimes);
}

export function mapFieldAnswersToQKeys(
  answers: Record<string, StoredAnswerValue>,
  schema: StoredAnswerSchema,
): Record<string, StoredAnswerValue> {
  const exportSchema = coerceFormExportSchema(schema);
  const fieldMap = buildFieldNameToQKeyMapFromSchema(exportSchema);
  const mapped: Record<string, StoredAnswerValue> = {};

  for (const [fieldName, qKey] of fieldMap) {
    const value = answers[fieldName];
    if (hasStoredAnswerValue(value)) {
      mapped[qKey] = value!;
    }
  }

  for (const [key, value] of Object.entries(answers)) {
    if (isQKey(key) && hasStoredAnswerValue(value)) {
      mapped[key] = value;
    }
  }

  return mapped;
}

export function mapFieldTimesToQKeys(
  responseTimes: Record<string, number>,
  schema: StoredAnswerSchema,
): Record<string, number> {
  const exportSchema = coerceFormExportSchema(schema);
  const fieldMap = buildFieldNameToQKeyMapFromSchema(exportSchema);
  const mapped: Record<string, number> = {};

  for (const [fieldName, qKey] of fieldMap) {
    const value = responseTimes[fieldName];
    if (value !== undefined) {
      mapped[qKey] = value;
    }
  }

  for (const [key, value] of Object.entries(responseTimes)) {
    if (isQKey(key) && value !== undefined) {
      mapped[key] = value;
    }
  }

  return mapped;
}

export type ScreenerCsvExportRow = Record<string, string | number>;

export function buildScreenerCsvExportRow(input: {
  leadId: string;
  fullName: string;
  mobile: string;
  city: string | null;
  answers: Record<string, unknown>;
  responseTimes?: Record<string, number> | null;
  totalDurationSec?: number | null;
}): ScreenerCsvExportRow {
  const row: ScreenerCsvExportRow = {
    Lead_ID: input.leadId,
    full_name: input.fullName,
    mobile: input.mobile,
    city: input.city ?? "",
  };

  const qKeys = sortQKeys(Object.keys(input.answers));

  for (const key of qKeys) {
    row[key] = String(input.answers[key] ?? "");
    const timeKey = `${key}_Time`;
    row[timeKey] =
      input.responseTimes?.[key] !== undefined
        ? input.responseTimes[key]
        : "";
  }

  row.Total_Duration =
    input.totalDurationSec !== null && input.totalDurationSec !== undefined
      ? input.totalDurationSec
      : "";

  return row;
}
