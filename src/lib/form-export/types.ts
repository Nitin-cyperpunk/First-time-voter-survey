export type FormQuestionType =
  | "single_select"
  | "multiple_select"
  | "matrix"
  | "open_multi"
  | "repeat"
  | "text"
  | "textarea"
  | "select"
  | "number"
  | "date"
  | "email"
  | "tel";

export type FormMatrixRow = {
  label: string;
  fieldName: string;
  qKey?: string;
};

export type FormOpenMultiBox = {
  label: string;
  fieldName: string;
  qKey?: string;
};

export type FormExportQuestion = {
  id: string;
  qKey: string;
  label: string;
  type: FormQuestionType;
  fieldName?: string;
  required?: boolean;
  options?: string[];
  rows?: FormMatrixRow[];
  boxes?: FormOpenMultiBox[];
  matrixColumns?: string[];
  otherOption?: string;
  /** Q-key of the companion "other specify" field, when present. */
  otherKey?: string;
  /** Alias for otherOption in some schema metadata. */
  otherValue?: string;
  otherSpecifyField?: string;
  /** When true (default), other text is folded as Other-<text>. When false, a separate - Other column is used. */
  otherInline?: boolean;
  /** @deprecated Use otherInline instead. */
  exportOtherSpecifySeparately?: boolean;
  repeatFields?: string[];
};

export type FormExportSchema = {
  version: 1;
  fields: FormExportQuestion[];
};

export type NormalizedExportMap = Record<string, string>;

export type FormExportRow = Record<string, string | number>;

/** Identity / capacity fields excluded from survey Q-key export. */
export const REGISTRATION_CORE_FIELDS = new Set([
  "city",
  "city_id",
  "email",
  "area",
  "zip",
  "age_band",
]);
