import type { ExportRow } from "@/lib/export";

import { buildSurveyExportColumns } from "@/lib/survey-export/build-columns";
import type {
  SurveyExportOptions,
  SurveyExportQuestionDef,
  SurveyExportSourceRow,
} from "@/lib/survey-export/types";

export function buildSurveyExportRows(input: {
  responses: SurveyExportSourceRow[];
  schemaQuestions: SurveyExportQuestionDef[];
  options?: SurveyExportOptions;
  absorbedQKeys?: Set<string>;
}): ExportRow[] {
  const columns = buildSurveyExportColumns(
    input.schemaQuestions,
    input.responses,
    input.options,
    input.absorbedQKeys,
  );

  return input.responses.map((response) => {
    const row: ExportRow = {};
    for (const column of columns) {
      const value = column.resolve(response);
      row[column.header] = value === undefined || value === null ? "" : value;
    }
    return row;
  });
}

export function buildSurveyExportHeaders(input: {
  responses: SurveyExportSourceRow[];
  schemaQuestions: SurveyExportQuestionDef[];
  options?: SurveyExportOptions;
  absorbedQKeys?: Set<string>;
}): string[] {
  return buildSurveyExportColumns(
    input.schemaQuestions,
    input.responses,
    input.options,
    input.absorbedQKeys,
  ).map((column) => column.header);
}
