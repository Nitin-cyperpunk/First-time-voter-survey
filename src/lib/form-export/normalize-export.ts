import type {
  FormExportSchema,
  NormalizedExportMap,
} from "@/lib/form-export/types";
import {
  expandQuestionExportColumns,
  resolveQuestionExportCells,
  toExpandableQuestion,
} from "@/lib/form-export/expand-export-columns";
import { isQKey } from "@/lib/response-storage";
import { nestAnswersByQuestion } from "@/lib/survey-export/nest-by-question";
import {
  answersUseLabeledKeys,
  labeledAnswersToQKeyMap,
} from "@/lib/survey-export/question-format";
import { findAnswerForQKey } from "@/lib/survey-export/q-key";

export type NormalizeExportInput = {
  schema: FormExportSchema;
  answers: Record<string, unknown>;
  fieldAnswers?: Record<string, unknown>;
  fieldNameToQKey?: Map<string, string>;
};

/**
 * Flat export map keyed by spec headers
 * (question text, "<Question> - <Option>", "<Question> - <Row>",
 * "<Question> - Other Specify Text") plus stable storage-key aliases.
 */
export function buildNormalizedExport(
  input: NormalizeExportInput,
): NormalizedExportMap {
  const rawAnswers = { ...input.answers };
  if (input.fieldAnswers) {
    for (const [fieldName, value] of Object.entries(input.fieldAnswers)) {
      if (rawAnswers[fieldName] === undefined) {
        rawAnswers[fieldName] = value;
      }
    }
  }

  const qKeyAnswers = answersUseLabeledKeys(rawAnswers)
    ? labeledAnswersToQKeyMap(
        rawAnswers as Record<
          string,
          import("@/lib/survey-response-document").SurveyAnswerValue
        >,
        input.schema,
      )
    : (rawAnswers as Record<string, unknown>);

  const nested = nestAnswersByQuestion(qKeyAnswers, input.schema);
  const normalized: NormalizedExportMap = {};

  for (const field of input.schema.fields) {
    const value = findAnswerForQKey(nested, field.qKey);
    const expandable = toExpandableQuestion(field);
    const expanded = expandQuestionExportColumns(expandable);
    const cells = resolveQuestionExportCells(expandable, value);

    for (const column of expanded) {
      const cell = cells[column.header] ?? "";
      normalized[column.header] = cell;
      normalized[column.storageKey] = cell;
    }
  }

  return normalized;
}

export function answersToFieldMap(
  answers: Record<string, unknown>,
  fieldNameToQKey: Map<string, string>,
): Record<string, unknown> {
  const fieldAnswers: Record<string, unknown> = {};
  for (const [fieldName, qKey] of fieldNameToQKey.entries()) {
    if (answers[qKey] !== undefined) {
      fieldAnswers[fieldName] = answers[qKey];
    }
  }

  for (const [key, value] of Object.entries(answers)) {
    if (!isQKey(key)) {
      fieldAnswers[key] = value;
    }
  }

  return fieldAnswers;
}
