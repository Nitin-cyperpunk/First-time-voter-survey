import type {
  FormExportQuestion,
  FormExportRow,
  FormExportSchema,
  NormalizedExportMap,
} from "@/lib/form-export/types";
import {
  expandQuestionExportColumns,
  resolveQuestionExportCells,
  RESPONDENT_ID_HEADER,
  toExpandableQuestion,
} from "@/lib/form-export/expand-export-columns";
import { findAnswerForQKey } from "@/lib/survey-export/q-key";

export type ExportColumn = {
  header: string;
  storageKeys: string[];
};

export function buildExportColumns(
  schema: FormExportSchema,
  options?: { respondentIdHeader?: string },
): ExportColumn[] {
  const columns: ExportColumn[] = [
    {
      header: options?.respondentIdHeader ?? RESPONDENT_ID_HEADER,
      storageKeys: [],
    },
  ];

  for (const question of schema.fields) {
    columns.push(...columnsForQuestion(question));
  }

  return columns;
}

function columnsForQuestion(question: FormExportQuestion): ExportColumn[] {
  return expandQuestionExportColumns(toExpandableQuestion(question)).map(
    (column) => ({
      header: column.header,
      storageKeys: [column.storageKey, column.header],
    }),
  );
}

export function buildExportRow(input: {
  leadId: string;
  schema: FormExportSchema;
  normalized: NormalizedExportMap;
  metadata?: Record<string, string | number>;
  respondentIdHeader?: string;
}): FormExportRow {
  const idHeader = input.respondentIdHeader ?? RESPONDENT_ID_HEADER;
  const columns = buildExportColumns(input.schema, {
    respondentIdHeader: idHeader,
  });
  // Respondent ID first (Excel uses Object.keys insertion order).
  const row: FormExportRow = {
    [idHeader]: input.leadId,
  };

  if (input.metadata) {
    for (const [key, value] of Object.entries(input.metadata)) {
      if (key === idHeader) continue;
      row[key] = value;
    }
  }

  for (const column of columns.slice(1)) {
    row[column.header] = pickNormalizedValue(input.normalized, column.storageKeys);
  }

  return row;
}

/**
 * Build a flat export row directly from nested answers (preferred path).
 */
export function buildExportRowFromAnswers(input: {
  leadId: string;
  schema: FormExportSchema;
  nestedAnswers: Record<string, unknown>;
  metadata?: Record<string, string | number>;
  respondentIdHeader?: string;
}): FormExportRow {
  const idHeader = input.respondentIdHeader ?? RESPONDENT_ID_HEADER;
  const row: FormExportRow = {
    [idHeader]: input.leadId,
  };

  if (input.metadata) {
    for (const [key, value] of Object.entries(input.metadata)) {
      if (key === idHeader) continue;
      row[key] = value;
    }
  }

  for (const field of input.schema.fields) {
    const value = findAnswerForQKey(input.nestedAnswers, field.qKey);
    const cells = resolveQuestionExportCells(
      toExpandableQuestion(field),
      value,
    );
    Object.assign(row, cells);
  }

  return row;
}

function pickNormalizedValue(
  normalized: NormalizedExportMap,
  storageKeys: string[],
): string {
  for (const key of storageKeys) {
    if (normalized[key] !== undefined && normalized[key] !== "") {
      return normalized[key] ?? "";
    }
  }
  for (const key of storageKeys) {
    if (normalized[key] !== undefined) {
      return normalized[key] ?? "";
    }
  }
  return "";
}

export function mergeExportSchemas(schemas: FormExportSchema[]): FormExportSchema {
  const fields = schemas.flatMap((schema) => schema.fields);
  const seen = new Set<string>();
  const merged = fields.filter((field) => {
    // Same question identity (qKey + id) collapses label-only drift across versions.
    const token = `${field.qKey}:${field.id}`;
    if (seen.has(token)) return false;
    seen.add(token);
    return true;
  });

  // Union options/rows across versions so multi/matrix columns stay complete.
  const byToken = new Map<string, FormExportQuestion>();
  for (const field of fields) {
    const token = `${field.qKey}:${field.id}`;
    const existing = byToken.get(token);
    if (!existing) {
      byToken.set(token, { ...field, options: field.options ? [...field.options] : undefined });
      continue;
    }
    if (field.options?.length) {
      const options = new Set([...(existing.options ?? []), ...field.options]);
      existing.options = [...options];
    }
    if (field.rows?.length && !existing.rows?.length) {
      existing.rows = field.rows;
    }
    if (field.otherOption && !existing.otherOption) {
      existing.otherOption = field.otherOption;
    }
    if (field.otherKey && !existing.otherKey) {
      existing.otherKey = field.otherKey;
    }
    if (field.otherSpecifyField && !existing.otherSpecifyField) {
      existing.otherSpecifyField = field.otherSpecifyField;
    }
  }

  return {
    version: 1,
    fields: merged.map((field) => byToken.get(`${field.qKey}:${field.id}`) ?? field),
  };
}

export function buildExportRows(input: {
  responses: Array<{
    leadId: string;
    normalized: NormalizedExportMap;
    metadata?: Record<string, string | number>;
  }>;
  schema: FormExportSchema;
  respondentIdHeader?: string;
}): FormExportRow[] {
  return input.responses.map((response) =>
    buildExportRow({
      leadId: response.leadId,
      schema: input.schema,
      normalized: response.normalized,
      metadata: response.metadata,
      respondentIdHeader: input.respondentIdHeader,
    }),
  );
}

export function unionExportColumns(schemas: FormExportSchema[]): ExportColumn[] {
  const merged = mergeExportSchemas(schemas);
  return buildExportColumns(merged);
}
