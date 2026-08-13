import { buildFieldNameToQKeyMapFromSchema } from "@/lib/form-export";
import type { FormExportSchema } from "@/lib/form-export/types";
import { isQKey } from "@/lib/response-storage";

function toStorageQKey(key: string): string | null {
  const match = key.match(/^q(\d+)$/i);
  if (match) return `Q${match[1]}`;
  return isQKey(key) ? key : null;
}

/** Map row/other/open-multi companion Q-keys onto their parent question key. */
function buildAbsorbedToParentQKeyMap(
  schema: FormExportSchema,
): Map<string, string> {
  const map = new Map<string, string>();

  for (const field of schema.fields) {
    const parent = toStorageQKey(field.qKey);
    if (!parent) continue;

    if (field.otherKey) {
      const other = toStorageQKey(field.otherKey);
      if (other && other !== parent) map.set(other, parent);
    }

    for (const row of field.rows ?? []) {
      if (!row.qKey) continue;
      const rowKey = toStorageQKey(row.qKey);
      if (rowKey && rowKey !== parent) map.set(rowKey, parent);
    }

    for (const box of field.boxes ?? []) {
      if (!box.qKey) continue;
      const boxKey = toStorageQKey(box.qKey);
      if (boxKey && boxKey !== parent) map.set(boxKey, parent);
    }
  }

  return map;
}

/**
 * Coerce client timing keys (field names / row Q-keys) onto the same Q-keys
 * used by nested survey answers, so validateScreenerSubmission can pass.
 */
export function normalizeSurveyResponseTimes(
  responseTimes: Record<string, number> | undefined,
  answerKeys: Iterable<string>,
  schema: FormExportSchema | null | undefined,
): Record<string, number> {
  const fieldToQ = schema
    ? buildFieldNameToQKeyMapFromSchema(schema)
    : new Map<string, string>();
  const absorbedToParent = schema
    ? buildAbsorbedToParentQKeyMap(schema)
    : new Map<string, string>();

  const aggregated: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(responseTimes ?? {})) {
    const n = Number(rawValue);
    if (!Number.isFinite(n)) continue;
    const seconds = Math.max(0, Math.round(n));

    const mapped = fieldToQ.get(rawKey) ?? rawKey;
    let qKey = toStorageQKey(mapped);
    if (!qKey) continue;
    qKey = absorbedToParent.get(qKey) ?? qKey;
    aggregated[qKey] = (aggregated[qKey] ?? 0) + seconds;
  }

  const aligned: Record<string, number> = {};
  for (const key of answerKeys) {
    const qKey = toStorageQKey(key);
    if (!qKey) continue;
    aligned[qKey] = aggregated[qKey] ?? 0;
  }
  return aligned;
}
