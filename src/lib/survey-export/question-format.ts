import type { FormExportQuestion, FormExportSchema } from "@/lib/form-export/types";
import type { SurveyAnswerValue } from "@/lib/survey-response-document";

import { cleanExportLabel } from "@/lib/survey-export/schema-map";
import {
  formatArrayCommaSeparated,
  formatExportScalar,
  isMatrixObject,
  isRepeatAnswer,
} from "@/lib/survey-export/format-value";
import { findAnswerForQKey } from "@/lib/survey-export/q-key";

export function formatQuestionHeader(qKey: string, label: string): string {
  const number = qKey.replace(/\D/g, "");
  const prefix = number ? `Q${number}` : qKey.toUpperCase();
  return `${prefix}. ${cleanExportLabel(label)}`;
}

export function isLabeledAnswerKey(key: string): boolean {
  return /^Q\d+\.\s/.test(key);
}

export function formatAnswerForExportCell(
  value: SurveyAnswerValue | undefined,
  type: FormExportQuestion["type"],
): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (isRepeatAnswer(value) || (type === "repeat" && Array.isArray(value))) {
    return JSON.stringify(value);
  }

  if (isMatrixObject(value) || (type === "matrix" && typeof value === "object")) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return formatArrayCommaSeparated(value);
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return formatExportScalar(value);
}

export function buildLabeledAnswers(
  nestedAnswers: Record<string, SurveyAnswerValue>,
  schema: FormExportSchema,
): Record<string, SurveyAnswerValue> {
  const labeled: Record<string, SurveyAnswerValue> = {};

  for (const field of schema.fields) {
    const value = findAnswerForQKey(nestedAnswers, field.qKey);
    if (value === undefined) {
      continue;
    }
    labeled[formatQuestionHeader(field.qKey, field.label)] = value;
  }

  return labeled;
}

export function buildLabeledAnswerCsvRow(input: {
  nestedAnswers: Record<string, SurveyAnswerValue>;
  schema: FormExportSchema;
  metadata?: Record<string, string | number>;
}): Record<string, string | number> {
  const row: Record<string, string | number> = {
    ...(input.metadata ?? {}),
  };

  for (const field of input.schema.fields) {
    const header = formatQuestionHeader(field.qKey, field.label);
    const value = findAnswerForQKey(input.nestedAnswers, field.qKey);
    row[header] = formatAnswerForExportCell(value, field.type);
  }

  return row;
}

export function answersUseLabeledKeys(
  answers: Record<string, unknown>,
): boolean {
  return Object.keys(answers).some(isLabeledAnswerKey);
}

export function labeledAnswersToQKeyMap(
  labeledAnswers: Record<string, SurveyAnswerValue>,
  schema: FormExportSchema,
): Record<string, SurveyAnswerValue> {
  const byHeader = new Map<string, SurveyAnswerValue>();
  for (const [key, value] of Object.entries(labeledAnswers)) {
    byHeader.set(key, value);
  }

  const qKeyAnswers: Record<string, SurveyAnswerValue> = {};
  for (const field of schema.fields) {
    const header = formatQuestionHeader(field.qKey, field.label);
    const value =
      byHeader.get(header) ??
      byHeader.get(`${field.qKey}.${cleanExportLabel(field.label)}`);
    if (value !== undefined) {
      qKeyAnswers[field.qKey] = value;
    }
  }

  for (const [key, value] of Object.entries(labeledAnswers)) {
    if (isLabeledAnswerKey(key)) {
      continue;
    }
    qKeyAnswers[key] = value;
  }

  return qKeyAnswers;
}
