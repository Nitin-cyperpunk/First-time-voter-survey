import type { FormExportQuestion, FormExportSchema } from "@/lib/form-export/types";
import type { SurveyAnswerValue } from "@/lib/survey-response-document";

import { foldRuntimeFieldAnswers } from "@/lib/survey-export/fold-runtime-fields";
import { canonicalQKey } from "@/lib/survey-export/q-key";

const DEFAULT_OTHER_OPTION = "Other";

export function nestAnswersByQuestion(
  flatAnswers: Record<string, unknown>,
  schema: FormExportSchema,
): Record<string, SurveyAnswerValue> {
  const folded = foldRuntimeFieldAnswers(flatAnswers, schema);
  const nested: Record<string, unknown> = { ...folded };
  const absorbed = new Set<string>();

  for (const field of schema.fields) {
    switch (field.type) {
      case "multiple_select":
        nestMultipleSelect(nested, field, absorbed);
        break;
      case "single_select":
        nestSingleSelect(nested, field, absorbed);
        break;
      case "open_multi":
        nestOpenMulti(nested, field, absorbed);
        break;
      case "matrix":
        nestMatrix(nested, field, absorbed);
        break;
      case "repeat":
        nestRepeat(nested, field, absorbed);
        break;
      default:
        // text / number / etc. — keep folded parent values already on field.qKey
        break;
    }
  }

  for (const key of Object.keys(nested)) {
    if (isAbsorbedKey(key, absorbed)) {
      delete nested[key];
    }
  }

  return nested as Record<string, SurveyAnswerValue>;
}

export function collectAbsorbedQuestionKeys(
  schema: FormExportSchema,
): Set<string> {
  const absorbed = new Set<string>();

  for (const field of schema.fields) {
    switch (field.type) {
      case "multiple_select":
      case "single_select":
        markOtherKeyAbsorbed(field, absorbed);
        break;
      case "open_multi":
        markOpenMultiKeysAbsorbed(field, absorbed);
        break;
      case "matrix":
        markMatrixKeysAbsorbed(field, absorbed);
        break;
      case "repeat":
        markRepeatKeysAbsorbed(field, absorbed);
        break;
      default:
        break;
    }
  }

  return absorbed;
}

function nestMultipleSelect(
  nested: Record<string, unknown>,
  field: FormExportQuestion,
  absorbed: Set<string>,
) {
  const parentKey = field.qKey;
  const otherKey = resolveOtherKey(field);
  const otherOption = resolveOtherOption(field);
  const parentValue = readAnswerValue(nested, parentKey, field.fieldName);
  const otherText = readOtherText(nested, field, otherKey);

  if (parentValue === undefined && otherText === "") {
    return;
  }

  // Keep object-shaped values intact (e.g. matrix data under a multi-select key).
  // formatAnswerForExportCell will JSON.stringify them.
  if (
    parentValue !== null &&
    typeof parentValue === "object" &&
    !Array.isArray(parentValue)
  ) {
    nested[parentKey] = parentValue;
    markOtherKeyAbsorbed(field, absorbed);
    return;
  }

  const selected = parseMultiSelectValues(parentValue);
  const merged =
    otherKey || field.otherSpecifyField
      ? mergeOtherIntoMultiSelect(selected, otherOption, otherText)
      : selected;

  if (merged.length > 0) {
    nested[parentKey] = merged;
  } else {
    delete nested[parentKey];
  }

  markOtherKeyAbsorbed(field, absorbed);
}

function nestSingleSelect(
  nested: Record<string, unknown>,
  field: FormExportQuestion,
  absorbed: Set<string>,
) {
  const parentKey = field.qKey;
  const otherKey = resolveOtherKey(field);
  const otherOption = resolveOtherOption(field);
  const parentValue = readAnswerValue(nested, parentKey, field.fieldName);
  const otherText = readOtherText(nested, field, otherKey);

  if (parentValue === undefined && otherText === "") {
    return;
  }

  const value = stringifyScalar(parentValue);
  if (
    value &&
    otherText &&
    value.trim().toLowerCase() === otherOption.toLowerCase()
  ) {
    nested[parentKey] = formatOthersLabel(otherText);
  } else if (value) {
    nested[parentKey] = value;
  } else {
    delete nested[parentKey];
  }

  markOtherKeyAbsorbed(field, absorbed);
}

function nestOpenMulti(
  nested: Record<string, unknown>,
  field: FormExportQuestion,
  absorbed: Set<string>,
) {
  const parentKey = field.qKey;
  const boxes = field.boxes ?? [];
  const values: string[] = [];

  if (boxes.length === 0) {
    const parentValue = readAnswerValue(nested, parentKey, field.fieldName);
    if (Array.isArray(parentValue)) {
      for (const item of parentValue) {
        const text = stringifyScalar(item);
        if (text) values.push(text);
      }
    } else {
      const text = stringifyScalar(parentValue);
      if (text) values.push(text);
    }
  } else {
    for (const box of boxes) {
      const boxKey = box.qKey ?? parentKey;
      const text = stringifyScalar(
        readAnswerValue(nested, boxKey, box.fieldName),
      );
      if (text) values.push(text);
    }
  }

  if (values.length > 0) {
    nested[parentKey] = values;
  } else {
    // Keep a pre-folded parent (e.g. size "32B") instead of wiping it when
    // box field names were already absorbed or never present.
    const existing = readAnswerValue(nested, parentKey, field.fieldName);
    if (Array.isArray(existing)) {
      const kept = existing.map(stringifyScalar).filter(Boolean);
      if (kept.length > 0) {
        nested[parentKey] = kept;
      } else {
        delete nested[parentKey];
      }
    } else {
      const text = stringifyScalar(existing);
      if (text) {
        nested[parentKey] = text;
      } else {
        delete nested[parentKey];
      }
    }
  }

  markOpenMultiKeysAbsorbed(field, absorbed);
}

function nestMatrix(
  nested: Record<string, unknown>,
  field: FormExportQuestion,
  absorbed: Set<string>,
) {
  const parentKey = field.qKey;
  const rows = field.rows ?? [];
  if (rows.length === 0) {
    // Runtime-folded matrices land as objects on the parent Q-key with no static rows.
    const existing = readAnswerValue(nested, parentKey, field.fieldName);
    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      nested[parentKey] = existing;
    }
    return;
  }

  const consolidated: Record<string, string> = {};
  const existing = readAnswerValue(nested, parentKey, field.fieldName);
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [key, value] of Object.entries(existing)) {
      const text = stringifyScalar(value);
      if (text) consolidated[key] = text;
    }
  }

  for (const row of rows) {
    const rowKey = row.qKey ?? parentKey;
    const text = stringifyScalar(
      readAnswerValue(nested, rowKey, row.fieldName),
    );
    if (text) {
      const itemCode = row.qKey || row.fieldName || row.label;
      consolidated[itemCode] = text;
    }
  }

  if (Object.keys(consolidated).length > 0) {
    nested[parentKey] = consolidated;
  }

  markMatrixKeysAbsorbed(field, absorbed);
}

function nestRepeat(
  nested: Record<string, unknown>,
  field: FormExportQuestion,
  absorbed: Set<string>,
) {
  const parentKey = field.qKey;
  const existing = readAnswerValue(nested, parentKey, field.fieldName);
  if (isRepeatAnswerValue(existing)) {
    nested[parentKey] = existing;
    markRepeatKeysAbsorbed(field, absorbed, nested);
    return;
  }

  const entries = collectRepeatEntries(nested, field);
  if (entries.length > 0) {
    nested[parentKey] = entries;
  } else if (existing !== undefined) {
    nested[parentKey] = existing;
  } else {
    delete nested[parentKey];
  }

  markRepeatKeysAbsorbed(field, absorbed, nested);
}

function isRepeatAnswerValue(
  value: unknown,
): value is Array<Record<string, string>> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null &&
    !Array.isArray(value[0])
  );
}

function collectRepeatEntries(
  nested: Record<string, unknown>,
  field: FormExportQuestion,
): Array<Record<string, string>> {
  const repeatFields = field.repeatFields ?? [];
  if (repeatFields.length === 0) {
    return [];
  }

  let maxIndex = 0;
  for (const repeatField of repeatFields) {
    const pattern = new RegExp(`^${escapeRegExp(repeatField)}_(\\d+)$`, "i");
    for (const key of Object.keys(nested)) {
      const match = key.match(pattern);
      if (match?.[1]) {
        maxIndex = Math.max(maxIndex, Number.parseInt(match[1], 10));
      }
      if (fieldNameMatches(nested, repeatField, key)) {
        maxIndex = Math.max(maxIndex, 1);
      }
    }
  }

  const entries: Array<Record<string, string>> = [];
  for (let index = 1; index <= maxIndex; index += 1) {
    const entry: Record<string, string> = {};
    for (const repeatField of repeatFields) {
      const text = stringifyScalar(
        nested[`${repeatField}_${index}`] ??
          readAnswerValue(nested, undefined, repeatField),
      );
      if (text) {
        entry[repeatField] = text;
      }
    }
    if (Object.keys(entry).length > 0) {
      entries.push(entry);
    }
  }

  return entries;
}

function fieldNameMatches(
  nested: Record<string, unknown>,
  repeatField: string,
  key: string,
): boolean {
  return key.toLowerCase() === repeatField.toLowerCase() && nested[key] !== undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markRepeatKeysAbsorbed(
  field: FormExportQuestion,
  absorbed: Set<string>,
  nested?: Record<string, unknown>,
) {
  if (!nested) {
    return;
  }

  for (const repeatField of field.repeatFields ?? []) {
    const pattern = new RegExp(`^${escapeRegExp(repeatField)}_(\\d+)$`, "i");
    for (const key of Object.keys(nested)) {
      if (pattern.test(key) && canonicalQKey(key) !== canonicalQKey(field.qKey)) {
        absorbed.add(canonicalQKey(key));
      }
    }
  }
}

function resolveOtherKey(field: FormExportQuestion): string | undefined {
  return field.otherKey;
}

function resolveOtherOption(field: FormExportQuestion): string {
  return (
    field.otherOption ??
    field.otherValue ??
    DEFAULT_OTHER_OPTION
  ).trim();
}

function readOtherText(
  answers: Record<string, unknown>,
  field: FormExportQuestion,
  otherKey?: string,
): string {
  if (otherKey) {
    return stringifyScalar(readAnswerValue(answers, otherKey, undefined));
  }

  if (field.otherSpecifyField) {
    return stringifyScalar(
      readAnswerValue(answers, undefined, field.otherSpecifyField),
    );
  }

  return "";
}

function mergeOtherIntoMultiSelect(
  selected: string[],
  otherOption: string,
  otherText: string,
): string[] {
  const trimmedOther = otherText.trim();
  const merged: string[] = [];
  let replaced = false;

  for (const value of selected) {
    if (value.trim().toLowerCase() === otherOption.toLowerCase()) {
      if (trimmedOther) {
        merged.push(formatOthersLabel(trimmedOther));
        replaced = true;
      } else {
        merged.push(value);
      }
      continue;
    }
    merged.push(value);
  }

  if (!replaced && trimmedOther) {
    merged.push(formatOthersLabel(trimmedOther));
  }

  return merged;
}

function formatOthersLabel(text: string): string {
  return `Others - ${text.trim()}`;
}

function parseMultiSelectValues(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map(String).map((part) => part.trim()).filter(Boolean);
  }

  const raw = String(value).trim();
  if (!raw) return [];

  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((part) => part.trim()).filter(Boolean);
      }
    } catch {
      // Fall through to comma split.
    }
  }

  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function stringifyScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function readAnswerValue(
  answers: Record<string, unknown>,
  qKey?: string,
  fieldName?: string,
): unknown {
  if (qKey) {
    for (const [key, value] of Object.entries(answers)) {
      if (canonicalQKey(key) === canonicalQKey(qKey)) {
        return value;
      }
    }
  }

  if (fieldName && answers[fieldName] !== undefined) {
    return answers[fieldName];
  }

  return undefined;
}

function markOtherKeyAbsorbed(
  field: FormExportQuestion,
  absorbed: Set<string>,
) {
  const otherKey = resolveOtherKey(field);
  if (otherKey) {
    absorbed.add(canonicalQKey(otherKey));
  }
}

function markOpenMultiKeysAbsorbed(
  field: FormExportQuestion,
  absorbed: Set<string>,
) {
  const parent = canonicalQKey(field.qKey);
  for (const box of field.boxes ?? []) {
    const boxKey = box.qKey ?? field.qKey;
    if (canonicalQKey(boxKey) !== parent) {
      absorbed.add(canonicalQKey(boxKey));
    }
    if (box.fieldName) {
      absorbed.add(box.fieldName.toLowerCase());
    }
  }
}

function markMatrixKeysAbsorbed(
  field: FormExportQuestion,
  absorbed: Set<string>,
) {
  const parent = canonicalQKey(field.qKey);
  for (const row of field.rows ?? []) {
    const rowKey = row.qKey ?? field.qKey;
    if (canonicalQKey(rowKey) !== parent) {
      absorbed.add(canonicalQKey(rowKey));
    }
  }
}

function isAbsorbedKey(key: string, absorbed: Set<string>): boolean {
  return absorbed.has(canonicalQKey(key));
}
