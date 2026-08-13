import type {
  FormExportQuestion,
  FormQuestionType,
} from "@/lib/form-export/types";
import { cleanExportLabel } from "@/lib/survey-export/schema-map";
import {
  formatArrayCommaSeparated,
  formatExportScalar,
  isMatrixObject,
  isRepeatAnswer,
} from "@/lib/survey-export/format-value";
import { formatAnswerForExportCell } from "@/lib/survey-export/question-format";

export const RESPONDENT_ID_HEADER = "Respondent ID";

export type ExpandedExportColumn = {
  header: string;
  /** Stable key for looking up values in a normalized map. */
  storageKey: string;
};

export type ExpandableQuestion = {
  id?: string;
  qKey: string;
  label: string;
  type: FormQuestionType | "single" | "multi" | "matrix" | "open_multi" | "repeat";
  options?: string[];
  rows?: Array<{ label: string; fieldName?: string; qKey?: string; key?: string }>;
  boxes?: Array<{ label: string; fieldName?: string; qKey?: string }>;
  otherOption?: string;
  otherValue?: string;
  otherKey?: string;
  otherSpecifyField?: string;
};

function toFormType(
  type: ExpandableQuestion["type"],
): FormQuestionType {
  switch (type) {
    case "single":
      return "single_select";
    case "multi":
      return "multiple_select";
    case "matrix":
      return "matrix";
    case "open_multi":
      return "open_multi";
    case "repeat":
      return "repeat";
    default:
      return type;
  }
}

export function questionExportLabel(label: string): string {
  return cleanExportLabel(label);
}

export function optionColumnHeader(questionLabel: string, option: string): string {
  return `${questionExportLabel(questionLabel)} - ${cleanExportLabel(option)}`;
}

export function rowColumnHeader(questionLabel: string, rowLabel: string): string {
  return `${questionExportLabel(questionLabel)} - ${cleanExportLabel(rowLabel)}`;
}

export function otherSpecifyHeader(questionLabel: string): string {
  return `${questionExportLabel(questionLabel)} - Other Specify Text`;
}

function resolveOtherOption(question: ExpandableQuestion): string {
  return (question.otherOption || question.otherValue || "Other").trim() || "Other";
}

function hasOtherSpecify(question: ExpandableQuestion): boolean {
  return Boolean(
    question.otherKey ||
      question.otherSpecifyField ||
      question.otherOption ||
      question.otherValue,
  );
}

/**
 * Spec-compliant column headers for one question (questionnaire order).
 * Multi-select emits one column per DEFINED option; with Other → + Other Specify Text.
 */
export function expandQuestionExportColumns(
  question: ExpandableQuestion,
): ExpandedExportColumn[] {
  const formType = toFormType(question.type);
  const qLabel = questionExportLabel(question.label);
  const alias = question.id ? `${question.qKey}:${question.id}` : question.qKey;

  if (formType === "multiple_select") {
    const options = question.options?.length
      ? question.options
      : [];
    if (options.length === 0) {
      // No configured options — keep a single column so answers are not lost.
      return [{ header: qLabel, storageKey: alias }];
    }

    const columns: ExpandedExportColumn[] = options.map((option) => ({
      header: optionColumnHeader(qLabel, option),
      storageKey: `${alias}::opt::${option}`,
    }));

    if (hasOtherSpecify(question)) {
      columns.push({
        header: otherSpecifyHeader(qLabel),
        storageKey: `${alias}::other_text`,
      });
    }

    return columns;
  }

  if (formType === "matrix") {
    const rows = question.rows?.length ? question.rows : [];
    if (rows.length === 0) {
      return [{ header: qLabel, storageKey: alias }];
    }
    return rows.map((row) => ({
      header: rowColumnHeader(qLabel, row.label),
      storageKey: `${alias}::row::${row.label}`,
    }));
  }

  // single_select, text, open_multi, repeat, etc. — one column
  return [{ header: qLabel, storageKey: alias }];
}

function parseSelectedOptions(value: unknown): {
  selected: Set<string>;
  otherText: string;
} {
  const selected = new Set<string>();
  let otherText = "";

  const items: unknown[] = Array.isArray(value)
    ? value
    : value === null || value === undefined || value === ""
      ? []
      : typeof value === "string"
        ? value.split(",").map((part) => part.trim()).filter(Boolean)
        : [value];

  for (const item of items) {
    if (item === null || item === undefined) continue;
    if (typeof item === "object") continue;
    const text = String(item).trim();
    if (!text) continue;

    const othersMatch = /^Others?\s*-\s*(.*)$/i.exec(text);
    if (othersMatch) {
      otherText = othersMatch[1]?.trim() || otherText;
      continue;
    }

    selected.add(text);
  }

  return { selected, otherText };
}

function optionSelected(
  selected: Set<string>,
  option: string,
  otherOption: string,
  otherText: string,
): boolean {
  for (const value of selected) {
    if (value.trim().toLowerCase() === option.trim().toLowerCase()) {
      return true;
    }
  }
  if (
    option.trim().toLowerCase() === otherOption.trim().toLowerCase() &&
    otherText
  ) {
    return true;
  }
  return false;
}

function matrixRating(
  value: unknown,
  rowLabel: string,
): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const record = value as Record<string, unknown>;
  const direct = record[rowLabel];
  if (direct !== undefined && direct !== null && String(direct).trim()) {
    return formatExportScalar(direct as string | number | boolean);
  }
  // Case-insensitive / cleaned label fallback
  const target = cleanExportLabel(rowLabel).toLowerCase();
  for (const [key, rating] of Object.entries(record)) {
    if (cleanExportLabel(key).toLowerCase() === target) {
      return formatExportScalar(rating as string | number | boolean);
    }
  }
  return "";
}

/**
 * Resolve cell values for all expanded columns of one question from a nested answer.
 */
export function resolveQuestionExportCells(
  question: ExpandableQuestion,
  answerValue: unknown,
): Record<string, string> {
  const formType = toFormType(question.type);
  const columns = expandQuestionExportColumns(question);
  const cells: Record<string, string> = {};
  const qLabel = questionExportLabel(question.label);

  if (formType === "multiple_select") {
    const options = question.options?.length ? question.options : [];
    if (options.length === 0) {
      const header = columns[0]?.header ?? qLabel;
      if (isMatrixObject(answerValue) || isRepeatAnswer(answerValue)) {
        cells[header] = formatAnswerForExportCell(
          answerValue as never,
          "multiple_select",
        );
      } else if (Array.isArray(answerValue)) {
        cells[header] = formatArrayCommaSeparated(answerValue as never);
      } else {
        cells[header] = formatExportScalar(answerValue as never);
      }
      return cells;
    }

    const otherOption = resolveOtherOption(question);
    const { selected, otherText } = parseSelectedOptions(answerValue);

    // If "Other" was selected without the "Others - text" form (literal "Other" in array)
    const otherChosen = optionSelected(selected, otherOption, otherOption, otherText);

    for (const option of options) {
      const header = optionColumnHeader(qLabel, option);
      const chosen = optionSelected(selected, option, otherOption, otherText);
      cells[header] = chosen ? option : "";
    }

    if (hasOtherSpecify(question)) {
      cells[otherSpecifyHeader(qLabel)] = otherChosen || otherText ? otherText : "";
    }

    return cells;
  }

  if (formType === "matrix") {
    const rows = question.rows?.length ? question.rows : [];
    if (rows.length === 0) {
      const header = columns[0]?.header ?? qLabel;
      cells[header] = formatAnswerForExportCell(answerValue as never, "matrix");
      return cells;
    }
    for (const row of rows) {
      cells[rowColumnHeader(qLabel, row.label)] = matrixRating(
        answerValue,
        row.label,
      );
    }
    return cells;
  }

  const header = columns[0]?.header ?? qLabel;
  cells[header] = formatAnswerForExportCell(answerValue as never, formType);
  return cells;
}

/** Convert a FormExportQuestion into the expandable shape. */
export function toExpandableQuestion(
  field: FormExportQuestion,
): ExpandableQuestion {
  return {
    id: field.id,
    qKey: field.qKey,
    label: field.label,
    type: field.type,
    options: field.options,
    rows: field.rows,
    boxes: field.boxes,
    otherOption: field.otherOption,
    otherValue: field.otherValue,
    otherKey: field.otherKey,
    otherSpecifyField: field.otherSpecifyField,
  };
}
