import { DEFAULT_CALL_DISPOSITIONS } from "@/lib/call-dispositions/defaults";
import type {
  CallDispositionOption,
  CallDispositionsConfig,
} from "@/lib/call-dispositions/types";

export function slugifyDispositionKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function parseOption(value: unknown): CallDispositionOption | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const key =
    typeof record.key === "string" ? slugifyDispositionKey(record.key) : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  if (!key || !label) return null;
  return {
    key,
    label,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
  };
}

export function parseCallDispositionsRaw(raw: unknown): CallDispositionOption[] {
  if (!Array.isArray(raw)) return [];

  const parsed: CallDispositionOption[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const option = parseOption(item);
    if (!option || seen.has(option.key)) continue;
    seen.add(option.key);
    parsed.push(option);
  }

  return parsed;
}

export function parseCallDispositionsConfig(raw: unknown): CallDispositionsConfig {
  if (Array.isArray(raw)) {
    const options = parseCallDispositionsRaw(raw);
    return mergeCallDispositions(options);
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const options = parseCallDispositionsRaw(record.options);
    return {
      options: mergeCallDispositions(options).options,
      allowNotes:
        typeof record.allowNotes === "boolean"
          ? record.allowNotes
          : typeof record.allow_notes === "boolean"
            ? record.allow_notes
            : true,
    };
  }

  return mergeCallDispositions([]);
}

export function mergeCallDispositions(
  stored: CallDispositionOption[],
): CallDispositionsConfig {
  if (stored.length === 0) {
    return { options: [...DEFAULT_CALL_DISPOSITIONS], allowNotes: true };
  }

  const defaultsByKey = new Map(
    DEFAULT_CALL_DISPOSITIONS.map((option) => [option.key, option]),
  );
  const merged = stored.map((option) => ({
    ...defaultsByKey.get(option.key),
    ...option,
    key: option.key,
    label: option.label,
  }));

  return { options: merged, allowNotes: true };
}

export function getEnabledDispositions(
  config: CallDispositionsConfig,
): CallDispositionOption[] {
  return config.options.filter((option) => option.enabled);
}

export function findDispositionLabel(
  config: CallDispositionsConfig,
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  return config.options.find((option) => option.key === key)?.label ?? key;
}
