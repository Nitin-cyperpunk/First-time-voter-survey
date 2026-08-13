import type { CallDispositionOption, CallDispositionsConfig } from "@/lib/call-dispositions/types";
import {
  getEnabledDispositions,
  mergeCallDispositions,
  parseCallDispositionsConfig,
  slugifyDispositionKey,
} from "@/lib/call-dispositions/parse";
import {
  getCallDispositions,
  updateCallDispositions,
} from "@/server/repositories/form-settings.repository";

export async function fetchCallDispositionsForAdmin() {
  return getCallDispositions();
}

export function validateCallDispositionsPayload(
  raw: unknown,
): { ok: true; config: CallDispositionsConfig } | { ok: false; error: string } {
  const parsed = parseCallDispositionsConfig(raw);
  const options = parsed.options;

  if (options.length === 0) {
    return { ok: false, error: "At least one call disposition is required." };
  }

  const seen = new Set<string>();
  const normalized: CallDispositionOption[] = [];

  for (const option of options) {
    const key = slugifyDispositionKey(option.key || option.label);
    const label = option.label.trim();
    if (!key || !label) {
      return { ok: false, error: "Each disposition needs a label." };
    }
    if (seen.has(key)) {
      return { ok: false, error: `Duplicate disposition key "${key}".` };
    }
    seen.add(key);
    normalized.push({
      key,
      label,
      enabled: option.enabled,
    });
  }

  return {
    ok: true,
    config: {
      options: normalized,
      allowNotes:
        typeof parsed.allowNotes === "boolean" ? parsed.allowNotes : true,
    },
  };
}

export async function saveCallDispositions(raw: unknown) {
  const validation = validateCallDispositionsPayload(raw);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  return updateCallDispositions(validation.config);
}

export async function assertEnabledDispositionKey(dispositionKey: string) {
  const config = await getCallDispositions();
  const enabled = getEnabledDispositions(config);
  const match = enabled.find((option) => option.key === dispositionKey);
  if (!match) {
    throw new Error("INVALID_DISPOSITION");
  }
  return { config, option: match };
}

export { getEnabledDispositions, mergeCallDispositions };
