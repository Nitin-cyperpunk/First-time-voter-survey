import type {
  FormExportQuestion,
  FormExportSchema,
  FormMatrixRow,
  FormQuestionType,
} from "@/lib/form-export/types";
import { REGISTRATION_CORE_FIELDS } from "@/lib/form-export/types";
import {
  detectQuestionType,
  extractDataKey,
  extractDataOtherInline,
  extractDataOtherValue,
  extractInputValues,
  extractMatrixColumns,
  extractMatrixRows,
  extractOpenMultiBoxes,
  extractOtherSpecifyField,
  extractPrimaryFieldName,
  extractQuestionLabel,
  splitQuestionBlocks,
  stripHtmlScriptTags,
} from "@/lib/form-export/html-utils";
import { buildFieldNameToQKeyMap } from "@/lib/form-export/field-q-key-map";

function isExcludedCoreField(
  fieldName: string,
  options?: { excludeCoreFields?: boolean },
): boolean {
  const excludeCore = options?.excludeCoreFields ?? false;
  return (
    excludeCore &&
    (REGISTRATION_CORE_FIELDS.has(fieldName) || fieldName.startsWith("dob_"))
  );
}

export function parseFormExportSchemaFromHtml(
  html: string,
  options?: { excludeCoreFields?: boolean },
): FormExportSchema {
  const markup = stripHtmlScriptTags(html);
  const fieldToQKey = buildFieldNameToQKeyMap(markup, options);
  const usedQKeys = new Set<string>();
  const fields: FormExportQuestion[] = [];

  for (const block of splitQuestionBlocks(markup)) {
    const id = extractDataKey(block) ?? extractPrimaryFieldName(block);
    if (!id) continue;

    const label = extractQuestionLabel(block) || id;
    const detected = detectQuestionType(block);
    const fieldName = extractPrimaryFieldName(block) ?? id;
    // Keep export schema aligned with registration answers: core PII is stored on
    // participants / metadata, never under answers.Qn.
    if (isExcludedCoreField(fieldName, options)) {
      continue;
    }
    const otherOption = extractDataOtherValue(block) ?? undefined;
    const otherSpecifyField = extractOtherSpecifyField(block) ?? undefined;
    const otherInline = extractDataOtherInline(block);

    let type: FormQuestionType;
    let optionsList: string[] | undefined;
    let rows: FormMatrixRow[] = [];
    let boxes: FormExportQuestion["boxes"];

    switch (detected.type) {
      case "repeat":
        type = "repeat";
        break;
      case "open_multi":
        type = "open_multi";
        boxes = extractOpenMultiBoxes(block).map((box) => ({
          label: box.label,
          fieldName: box.fieldName,
          qKey: fieldToQKey.get(box.fieldName),
        }));
        break;
      case "matrix":
        type = "matrix";
        rows = extractMatrixRows(block).map((row) => ({
          label: row.label,
          fieldName: row.fieldName,
          qKey: fieldToQKey.get(row.fieldName),
        }));
        break;
      case "multiple_select":
        type = "multiple_select";
        optionsList = extractInputValues(block, "checkbox");
        break;
      case "single_select":
        type = "single_select";
        optionsList = extractInputValues(block, "radio");
        break;
      default:
        type =
          detected.inputType === "textarea"
            ? "textarea"
            : detected.inputType === "select"
              ? "select"
              : detected.inputType === "number"
                ? "number"
                : detected.inputType === "date"
                  ? "date"
                  : detected.inputType === "email"
                    ? "email"
                    : detected.inputType === "tel"
                      ? "tel"
                      : "text";
        break;
    }

    const qKey =
      type === "matrix"
        ? resolveMatrixQuestionQKey(rows, fieldToQKey, usedQKeys, fields.length)
        : type === "open_multi"
          ? resolveOpenMultiQuestionQKey(boxes ?? [], fieldToQKey, usedQKeys, fields.length)
        : fieldToQKey.get(fieldName) ?? nextAvailableQKey(usedQKeys, fields.length);

    usedQKeys.add(qKey);

    fields.push({
      id,
      qKey,
      label,
      type,
      fieldName,
      options: optionsList,
      rows: rows.length > 0 ? rows : undefined,
      boxes: boxes && boxes.length > 0 ? boxes : undefined,
      matrixColumns:
        rows.length > 0 ? extractMatrixColumns(block) : undefined,
      otherOption,
      otherKey: otherSpecifyField
        ? fieldToQKey.get(otherSpecifyField)
        : undefined,
      otherSpecifyField,
      otherInline,
      exportOtherSpecifySeparately: !otherInline,
    });
  }

  return { version: 1, fields };
}

function nextAvailableQKey(used: Set<string>, fallbackIndex: number): string {
  let index = fallbackIndex + 1;
  while (used.has(`Q${index}`)) index += 1;
  return `Q${index}`;
}

function resolveOpenMultiQuestionQKey(
  boxes: Array<{ qKey?: string }>,
  fieldToQKey: Map<string, string>,
  used: Set<string>,
  fallbackIndex: number,
): string {
  return resolveMatrixQuestionQKey(boxes, fieldToQKey, used, fallbackIndex);
}

function resolveMatrixQuestionQKey(
  rows: Array<{ qKey?: string }>,
  fieldToQKey: Map<string, string>,
  used: Set<string>,
  fallbackIndex: number,
): string {
  const rowKeys = rows
    .map((row) => row.qKey)
    .filter((value): value is string => Boolean(value));

  if (rowKeys.length > 0) {
    const numeric = rowKeys
      .map((key) => Number.parseInt(key.slice(1), 10))
      .filter((value) => Number.isFinite(value));
    if (numeric.length > 0) {
      return `Q${Math.min(...numeric)}`;
    }
  }

  return nextAvailableQKey(used, fallbackIndex);
}

export function assignSchemaQKeysFromHtml(
  schema: FormExportSchema,
  html: string,
  options?: { excludeCoreFields?: boolean },
): FormExportSchema {
  const parsed = parseFormExportSchemaFromHtml(html, options);
  if (parsed.fields.length === 0) return schema;

  const parsedById = new Map(parsed.fields.map((field) => [field.id, field]));

  return {
    version: 1,
    fields: schema.fields.map((field) => {
      const fresh = parsedById.get(field.id);
      if (!fresh) return field;
      return {
        ...field,
        qKey: fresh.qKey,
        type: fresh.type ?? field.type,
        options: fresh.options ?? field.options,
        rows: fresh.rows ?? field.rows,
        matrixColumns: fresh.matrixColumns ?? field.matrixColumns,
        otherOption: fresh.otherOption ?? field.otherOption,
        otherSpecifyField: fresh.otherSpecifyField ?? field.otherSpecifyField,
        otherInline: fresh.otherInline ?? field.otherInline,
        otherKey: fresh.otherKey ?? field.otherKey,
        otherValue: fresh.otherValue ?? field.otherValue,
        boxes: fresh.boxes ?? field.boxes,
        fieldName: fresh.fieldName ?? field.fieldName,
      };
    }),
  };
}
