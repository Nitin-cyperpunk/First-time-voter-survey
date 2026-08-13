import type { FormExportQuestion, FormExportSchema } from "@/lib/form-export/types";
import { isInternalAnswerKey } from "@/lib/survey-export/q-key";

type FoldShape = "list" | "object" | "size";

type FoldRule = {
  /** Match answer keys to fold into this question. */
  test: (key: string) => boolean;
  shape: FoldShape;
  /** Optional sort key extracted from the field name. */
  indexOf?: (key: string) => number;
};

function fieldIdentity(field: FormExportQuestion): string {
  return (field.id || field.fieldName || "").trim().toLowerCase();
}

/**
 * Map schema question ids / field names → runtime answer-key patterns
 * used by dynamically built screener HTML.
 */
export function runtimeFoldRulesForField(field: FormExportQuestion): FoldRule[] {
  const id = fieldIdentity(field);

  if (
    id === "q1_recall" ||
    id === "q1" ||
    id.startsWith("q1_brand") ||
    /brand.*recall|recall.*brand/i.test(field.label)
  ) {
    return [
      {
        test: (key) => /^q1_brand_\d+$/i.test(key),
        shape: "list",
        indexOf: (key) => Number.parseInt(key.replace(/\D/g, ""), 10) || 0,
      },
    ];
  }

  if (id === "q8_matrix" || id === "q8") {
    return [
      {
        // q8_0 … q8_19 but not q8_3_own / q8_3_switch
        test: (key) => /^q8_\d+$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.split("_")[1] ?? "", 10) || 0,
      },
    ];
  }

  if (id === "q8a_owned" || id === "q8a") {
    return [
      {
        test: (key) => /^q8_\d+_own$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.split("_")[1] ?? "", 10) || 0,
      },
    ];
  }

  if (id === "q8b_switch" || id === "q8b") {
    return [
      {
        test: (key) => /^q8_\d+_switch$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.split("_")[1] ?? "", 10) || 0,
      },
    ];
  }

  if (id === "q9_wear" || id === "q9") {
    return [
      {
        test: (key) => /^q9_\d+$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.split("_")[1] ?? "", 10) || 0,
      },
    ];
  }

  if (id === "q10_brand" || id === "q10") {
    return [
      {
        test: (key) => /^q10_\d+$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.split("_")[1] ?? "", 10) || 0,
      },
    ];
  }

  if (id === "q11_price" || id === "q11") {
    return [
      {
        test: (key) => /^q11_\d+$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.split("_")[1] ?? "", 10) || 0,
      },
    ];
  }

  if (id === "q12_place" || id === "q12") {
    return [
      {
        test: (key) => /^q12_\d+$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.split("_")[1] ?? "", 10) || 0,
      },
    ];
  }

  if (id === "q13_freq" || id === "q13") {
    return [
      {
        test: (key) => /^q13_\d+$/i.test(key) || /^q13when_\d+$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.replace(/\D/g, ""), 10) || 0,
      },
    ];
  }

  if (id === "q17_spend" || id === "q17") {
    return [
      {
        test: (key) => /^q17_\d+$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.split("_")[1] ?? "", 10) || 0,
      },
    ];
  }

  // Importance matrix (form label Q16) — not the sequential Q19 spend-more key.
  if (id === "q19") {
    return [
      {
        test: (key) => /^q19_\d+$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.split("_")[1] ?? "", 10) || 0,
      },
    ];
  }

  if (id === "q20") {
    return [
      {
        test: (key) => /^q20_\d+$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.split("_")[1] ?? "", 10) || 0,
      },
    ];
  }

  if (id === "q24") {
    return [
      {
        test: (key) => /^q24_\d+$/i.test(key),
        shape: "object",
        indexOf: (key) => Number.parseInt(key.split("_")[1] ?? "", 10) || 0,
      },
    ];
  }

  if (id === "q30") {
    // When band/cup/full are schema boxes, leave them for nestOpenMulti.
    if (field.boxes && field.boxes.length > 0) {
      return [];
    }
    return [
      {
        test: (key) =>
          key === "q30_band" || key === "q30_cup" || key === "q30_full",
        shape: "size",
      },
    ];
  }

  return [];
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

function buildListValue(
  entries: Array<{ key: string; value: unknown; index: number }>,
): string[] {
  return entries
    .sort((a, b) => a.index - b.index)
    .map((entry) => stringifyCell(entry.value))
    .filter(Boolean);
}

function buildObjectValue(
  entries: Array<{ key: string; value: unknown; index: number }>,
  fieldId: string,
): Record<string, string> {
  const out: Record<string, string> = {};

  if (fieldId === "q13_freq" || fieldId === "q13") {
    const wear: Record<string, string> = {};
    const when: Record<string, string> = {};
    for (const entry of entries) {
      const text = stringifyCell(entry.value);
      if (!text) continue;
      if (/^q13when_/i.test(entry.key)) {
        when[String(entry.index)] = text;
      } else {
        wear[String(entry.index)] = text;
      }
    }
    const indexes = new Set([...Object.keys(wear), ...Object.keys(when)]);
    for (const index of indexes) {
      const parts = [wear[index], when[index]].filter(Boolean);
      if (parts.length) out[index] = parts.join(" | ");
    }
    return out;
  }

  for (const entry of entries) {
    const text = stringifyCell(entry.value);
    if (!text) continue;
    out[String(entry.index)] = text;
  }
  return out;
}

function buildSizeValue(
  entries: Array<{ key: string; value: unknown }>,
): string {
  const byKey = new Map(
    entries.map((entry) => [entry.key.toLowerCase(), stringifyCell(entry.value)]),
  );
  const full = byKey.get("q30_full") || "";
  if (full) return full;
  const band = byKey.get("q30_band") || "";
  const cup = byKey.get("q30_cup") || "";
  return `${band}${cup}`.trim() || band || cup;
}

/**
 * Fold dynamically named answer keys (q8_0, q1_brand_1, …) onto their parent
 * schema Q-keys so export columns are no longer empty.
 */
export function foldRuntimeFieldAnswers(
  answers: Record<string, unknown>,
  schema: FormExportSchema,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...answers };
  const absorbed = new Set<string>();

  for (const field of schema.fields) {
    const rules = runtimeFoldRulesForField(field);
    if (rules.length === 0) continue;

    const parentKey = field.qKey;
    const fieldId = fieldIdentity(field);

    for (const rule of rules) {
      const entries: Array<{ key: string; value: unknown; index: number }> = [];
      for (const [key, value] of Object.entries(out)) {
        if (isInternalAnswerKey(key)) continue;
        if (absorbed.has(key)) continue;
        if (!rule.test(key)) continue;
        if (value === undefined || value === null || value === "") continue;
        entries.push({
          key,
          value,
          index: rule.indexOf?.(key) ?? 0,
        });
      }

      if (entries.length === 0) continue;

      for (const entry of entries) absorbed.add(entry.key);

      if (rule.shape === "list") {
        const list = buildListValue(entries);
        if (list.length > 0) out[parentKey] = list;
        continue;
      }

      if (rule.shape === "size") {
        const size = buildSizeValue(entries);
        if (size) out[parentKey] = size;
        continue;
      }

      const obj = buildObjectValue(entries, fieldId);
      if (Object.keys(obj).length > 0) {
        // Prefer runtime matrix/object over a stale scalar/array on the same Q-key
        // (sequential maps sometimes collide with brand multi-selects).
        out[parentKey] = obj;
      }
    }
  }

  for (const key of absorbed) {
    delete out[key];
  }

  return out;
}
