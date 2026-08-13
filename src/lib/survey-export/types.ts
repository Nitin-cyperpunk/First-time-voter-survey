import type { SurveyAnswerValue } from "@/lib/survey-response-document";

export type SurveyExportQuestionType =
  | "single"
  | "multi"
  | "matrix"
  | "open_multi"
  | "repeat";

export type SurveyExportMatrixRow = {
  label: string;
  key: string;
  qKey?: string;
};

export type SurveyExportOpenMultiBox = {
  label: string;
  qKey: string;
};

export type SurveyExportQuestionDef = {
  qKey: string;
  label: string;
  type: SurveyExportQuestionType;
  options?: string[];
  matrixRows?: SurveyExportMatrixRow[];
  openMultiBoxes?: SurveyExportOpenMultiBox[];
  otherKey?: string;
  otherOption?: string;
  otherValue?: string;
  absorbedQKeys?: string[];
  repeatFields?: string[];
};

export type SurveyExportSourceRow = {
  leadId: string;
  respondentName: string;
  mobile: string;
  gender: string;
  city: string;
  area: string;
  zipcode: string;
  surveyVersion: string;
  currentScreen: string;
  surveyCompletedAt: string;
  totalDuration: string | number;
  answers: Record<string, SurveyAnswerValue>;
  rawDocument?: unknown;
};

export type SurveyExportOptions = {
  includeDiagnostics?: boolean;
};

export type SurveyExportColumn = {
  header: string;
  resolve: (row: SurveyExportSourceRow) => string | number;
};
