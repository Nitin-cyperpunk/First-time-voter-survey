export const FTV_STATUSES = [
  "COMPLETE",
  "TERMINATE_NOT_FIRST_TIME",
  "TERMINATE_DID_NOT_VOTE",
  "TERMINATE_AGE_OUT_OF_RANGE",
] as const;

export type FtvStatus = (typeof FTV_STATUSES)[number];

export function isFtvStatus(value: string): value is FtvStatus {
  return (FTV_STATUSES as readonly string[]).includes(value);
}

export function resolveFtvStatus(input: {
  payloadStatus?: string | null;
  terminated?: boolean;
  terminations?: Array<{ ruleKey?: string | null }>;
}): FtvStatus | null {
  const fromPayload = input.payloadStatus?.trim();
  if (fromPayload && isFtvStatus(fromPayload)) return fromPayload;

  for (const termination of input.terminations ?? []) {
    const key = termination.ruleKey?.trim();
    if (key && isFtvStatus(key)) return key;
  }

  if (input.terminated || (input.terminations?.length ?? 0) > 0) {
    return null;
  }

  return "COMPLETE";
}

export function readFtvPayloadString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readFtvPayloadTimestamp(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const raw = readFtvPayloadString(payload, key);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function readFtvPayloadDuration(
  payload: Record<string, unknown>,
): number | null {
  const value = payload.duration_seconds;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

/** Canonical respondent_id is participants.lead_id (CI_FTV_####). */
export function stampFtvRespondentId(
  payload: Record<string, unknown>,
  leadId: string,
): Record<string, unknown> {
  return { ...payload, respondent_id: leadId };
}
