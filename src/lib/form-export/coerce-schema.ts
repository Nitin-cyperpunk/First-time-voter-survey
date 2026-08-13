import type { FormExportSchema } from "@/lib/form-export/types";

export function isFormExportSchema(value: unknown): value is FormExportSchema {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.fields);
}

export function coerceFormExportSchema(value: unknown): FormExportSchema {
  if (isFormExportSchema(value)) {
    return {
      version: 1,
      fields: value.fields.map((field, index) => ({
        ...field,
        qKey: field.qKey || `Q${index + 1}`,
      })),
    };
  }

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as { fields?: unknown }).fields)
  ) {
    const legacy = value as {
      fields: Array<{
        id: string;
        label: string;
        type?: string;
        options?: string[];
      }>;
    };

    return {
      version: 1,
      fields: legacy.fields.map((field, index) => ({
        id: field.id,
        qKey: /^Q\d+$/i.test(field.id) ? field.id : `Q${index + 1}`,
        label: field.label,
        type:
          field.type === "select"
            ? "single_select"
            : field.options?.length
              ? "multiple_select"
              : "text",
        fieldName: field.id,
        options: field.options,
      })),
    };
  }

  return { version: 1, fields: [] };
}
