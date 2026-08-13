import type { FormExportSchema, FormQuestionType } from "@/lib/form-export/types";

import { canonicalQKey } from "@/lib/survey-export/q-key";
import type {
  SurveyExportQuestionDef,
  SurveyExportQuestionType,
} from "@/lib/survey-export/types";

export function cleanExportLabel(label: string): string {
  return label
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapQuestionType(type: FormQuestionType): SurveyExportQuestionType {
  switch (type) {
    case "multiple_select":
      return "multi";
    case "matrix":
      return "matrix";
    case "open_multi":
      return "open_multi";
    case "repeat":
      return "repeat";
    default:
      return "single";
  }
}

export function buildSurveyExportSchemaMap(
  schema: FormExportSchema,
): SurveyExportQuestionDef[] {
  return schema.fields.map((field) => {
    const qKey = canonicalQKey(field.qKey);
    const def: SurveyExportQuestionDef = {
      qKey,
      label: cleanExportLabel(field.label),
      type: mapQuestionType(field.type),
    };

    if (field.type === "multiple_select" && field.options?.length) {
      def.options = [...field.options];
    }

    if (field.type === "matrix" && field.rows?.length) {
      def.matrixRows = field.rows.map((row, index) => ({
        label: cleanExportLabel(row.label),
        key: String(index),
        qKey: row.qKey ? canonicalQKey(row.qKey) : undefined,
      }));
    }

    if (field.type === "open_multi" && field.boxes?.length) {
      def.openMultiBoxes = field.boxes.map((box) => ({
        label: cleanExportLabel(box.label),
        qKey: box.qKey ? canonicalQKey(box.qKey) : qKey,
      }));
    }

    if (field.otherKey) {
      def.otherKey = canonicalQKey(field.otherKey);
    }
    if (field.otherOption) {
      def.otherOption = field.otherOption;
    }
    if (field.otherValue) {
      def.otherValue = field.otherValue;
    }

    return def;
  });
}

export function mergeSurveyExportSchemaMaps(
  maps: SurveyExportQuestionDef[][],
): SurveyExportQuestionDef[] {
  const byQKey = new Map<string, SurveyExportQuestionDef>();

  for (const questions of maps) {
    for (const question of questions) {
      const existing = byQKey.get(question.qKey);
      if (!existing) {
        byQKey.set(question.qKey, { ...question });
        continue;
      }

      byQKey.set(question.qKey, {
        ...existing,
        label: existing.label || question.label,
        options: unionStringLists(existing.options, question.options),
        matrixRows: existing.matrixRows ?? question.matrixRows,
        openMultiBoxes: existing.openMultiBoxes ?? question.openMultiBoxes,
        repeatFields: existing.repeatFields ?? question.repeatFields,
        otherOption: existing.otherOption ?? question.otherOption,
        otherValue: existing.otherValue ?? question.otherValue,
        otherKey: existing.otherKey ?? question.otherKey,
      });
    }
  }

  return [...byQKey.values()].sort((left, right) =>
    compareExportQKeys(left.qKey, right.qKey),
  );
}

function unionStringLists(
  left?: string[],
  right?: string[],
): string[] | undefined {
  if (!left?.length && !right?.length) return left ?? right;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [...(left ?? []), ...(right ?? [])]) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function compareExportQKeys(left: string, right: string): number {
  const leftNum = Number.parseInt(left.replace(/\D/g, ""), 10);
  const rightNum = Number.parseInt(right.replace(/\D/g, ""), 10);
  if (!Number.isNaN(leftNum) && !Number.isNaN(rightNum)) {
    return leftNum - rightNum;
  }
  return left.localeCompare(right);
}
