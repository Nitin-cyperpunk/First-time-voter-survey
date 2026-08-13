import {
  expandQuestionExportColumns,
  RESPONDENT_ID_HEADER,
  resolveQuestionExportCells,
  type ExpandableQuestion,
} from "@/lib/form-export/expand-export-columns";
import type { FormQuestionType } from "@/lib/form-export/types";
import {
  canonicalQKey,
  collectOrphanQuestionKeys,
  findAnswerForQKey,
} from "@/lib/survey-export/q-key";
import type {
  SurveyExportColumn,
  SurveyExportOptions,
  SurveyExportQuestionDef,
  SurveyExportSourceRow,
} from "@/lib/survey-export/types";

import { isMatrixObject, isRepeatAnswer } from "@/lib/survey-export/format-value";

const METADATA_COLUMNS: SurveyExportColumn[] = [
  {
    header: RESPONDENT_ID_HEADER,
    resolve: (row) => row.leadId,
  },
  {
    header: "Respondent Name",
    resolve: (row) => row.respondentName,
  },
  {
    header: "Mobile",
    resolve: (row) => row.mobile,
  },
  {
    header: "Gender",
    resolve: (row) => row.gender,
  },
  {
    header: "City",
    resolve: (row) => row.city,
  },
  {
    header: "Area",
    resolve: (row) => row.area,
  },
  {
    header: "Zipcode",
    resolve: (row) => row.zipcode,
  },
  {
    header: "Survey Version",
    resolve: (row) => row.surveyVersion,
  },
  {
    header: "Current Screen",
    resolve: (row) => row.currentScreen,
  },
  {
    header: "Survey Completed At",
    resolve: (row) => row.surveyCompletedAt,
  },
  {
    header: "Total Duration",
    resolve: (row) => row.totalDuration,
  },
];

const DIAGNOSTIC_COLUMNS: SurveyExportColumn[] = [
  {
    header: "Last Screen",
    resolve: (row) => readDocumentField(row, "_last_screen"),
  },
  {
    header: "Screen Times",
    resolve: (row) => readDocumentField(row, "_screen_times"),
  },
  {
    header: "Termination Reason",
    resolve: (row) => readDocumentField(row, "_termReason"),
  },
  {
    header: "End Reason",
    resolve: (row) => readDocumentField(row, "_endReason"),
  },
];

function readDocumentField(row: SurveyExportSourceRow, key: string): string {
  if (!row.rawDocument || typeof row.rawDocument !== "object") {
    return "";
  }

  const value = (row.rawDocument as Record<string, unknown>)[key];
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function toExpandable(question: SurveyExportQuestionDef): ExpandableQuestion {
  return {
    qKey: question.qKey,
    label: question.label,
    type: mapExportType(question.type),
    options: question.options,
    rows: question.matrixRows?.map((row) => ({
      label: row.label,
      qKey: row.qKey,
      key: row.key,
    })),
    boxes: question.openMultiBoxes?.map((box) => ({
      label: box.label,
      qKey: box.qKey,
    })),
    otherOption: question.otherOption,
    otherValue: question.otherValue,
    otherKey: question.otherKey,
  };
}

function expandQuestionColumns(
  question: SurveyExportQuestionDef,
): SurveyExportColumn[] {
  const expandable = toExpandable(question);
  const expanded = expandQuestionExportColumns(expandable);

  return expanded.map((column) => ({
    header: column.header,
    resolve: (row) => {
      const value = findAnswerForQKey(row.answers, question.qKey);
      const cells = resolveQuestionExportCells(expandable, value);
      return cells[column.header] ?? "";
    },
  }));
}

function mapExportType(
  type: SurveyExportQuestionDef["type"],
): FormQuestionType {
  switch (type) {
    case "multi":
      return "multiple_select";
    case "open_multi":
      return "open_multi";
    case "matrix":
      return "matrix";
    case "repeat":
      return "repeat";
    default:
      return "single_select";
  }
}

function inferOrphanQuestionType(
  value: ReturnType<typeof findAnswerForQKey>,
): SurveyExportQuestionDef["type"] {
  if (isRepeatAnswer(value)) {
    return "repeat";
  }
  if (Array.isArray(value)) {
    return "multi";
  }
  if (isMatrixObject(value)) {
    return "matrix";
  }
  return "single";
}

export function buildSurveyExportColumns(
  questions: SurveyExportQuestionDef[],
  responses: SurveyExportSourceRow[],
  options?: SurveyExportOptions,
  absorbedQKeys?: Set<string>,
): SurveyExportColumn[] {
  const knownQKeys = new Set(questions.map((question) => question.qKey));
  const absorbed = absorbedQKeys ?? new Set<string>();
  const columns: SurveyExportColumn[] = [...METADATA_COLUMNS];

  for (const question of questions) {
    columns.push(...expandQuestionColumns(question));
  }

  const orphanKeys = new Set<string>();
  for (const response of responses) {
    for (const key of collectOrphanQuestionKeys(response.answers, knownQKeys)) {
      const canonical = canonicalQKey(key);
      if (absorbed.has(canonical)) {
        continue;
      }
      orphanKeys.add(canonical);
    }
  }

  for (const qKey of [...orphanKeys].sort((left, right) =>
    Number.parseInt(left.replace(/\D/g, ""), 10) -
    Number.parseInt(right.replace(/\D/g, ""), 10),
  )) {
    const sampleValue = responses
      .map((response) => findAnswerForQKey(response.answers, qKey))
      .find((value) => value !== undefined);

    const orphanQuestion: SurveyExportQuestionDef = {
      qKey,
      label: `Question ${qKey.replace(/\D/g, "")}`,
      type: inferOrphanQuestionType(sampleValue),
    };

    columns.push(...expandQuestionColumns(orphanQuestion));
  }

  if (options?.includeDiagnostics) {
    columns.push(...DIAGNOSTIC_COLUMNS);
  }

  return columns;
}
