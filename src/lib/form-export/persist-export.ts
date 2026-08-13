import {
  answersToFieldMap,
  buildExportRow,
  buildFieldNameToQKeyMap,
  buildNormalizedExport,
  coerceFormExportSchema,
  parseFormExportSchemaFromHtml,
  type FormExportSchema,
  type NormalizedExportMap,
} from "@/lib/form-export";
import { nestAnswersByQuestion } from "@/lib/survey-export/nest-by-question";
import {
  answersUseLabeledKeys,
  labeledAnswersToQKeyMap,
} from "@/lib/survey-export/question-format";

export function resolveFormExportSchema(
  schema: unknown,
  html?: string | null,
  options?: { excludeCoreFields?: boolean },
): FormExportSchema {
  const coerced = coerceFormExportSchema(schema);
  if (coerced.fields.length > 0 || !html) {
    return coerced;
  }

  return parseFormExportSchemaFromHtml(html, options);
}

export function buildResponseExportArtifacts(input: {
  schema: FormExportSchema;
  html?: string | null;
  answers: Record<string, unknown>;
  leadId: string;
  metadata?: Record<string, string | number>;
  excludeCoreFields?: boolean;
  respondentIdHeader?: string;
}): {
  normalizedExport: NormalizedExportMap;
  csvRow: Record<string, string | number>;
} {
  const fieldNameToQKey = input.html
    ? buildFieldNameToQKeyMap(input.html, {
        excludeCoreFields: input.excludeCoreFields,
      })
    : new Map<string, string>();

  const fieldAnswers = answersToFieldMap(input.answers, fieldNameToQKey);
  const qKeyAnswers = answersUseLabeledKeys(input.answers)
    ? labeledAnswersToQKeyMap(
        input.answers as Record<string, import("@/lib/survey-response-document").SurveyAnswerValue>,
        input.schema,
      )
    : {
        ...input.answers,
        ...fieldAnswers,
      };
  const nestedAnswers = nestAnswersByQuestion(qKeyAnswers, input.schema);
  const normalizedExport = buildNormalizedExport({
    schema: input.schema,
    answers: nestedAnswers,
    fieldAnswers,
    fieldNameToQKey,
  });

  const csvRow = buildExportRow({
    leadId: input.leadId,
    schema: input.schema,
    normalized: normalizedExport,
    metadata: input.metadata,
    respondentIdHeader: input.respondentIdHeader,
  });

  return { normalizedExport, csvRow };
}
