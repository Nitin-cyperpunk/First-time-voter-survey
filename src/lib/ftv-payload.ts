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

export function extractStoredFtvPayload(source: unknown): Record<string, unknown> | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const record = source as Record<string, unknown>;
  const nested = record.__ftv_payload;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const payload = nested as Record<string, unknown>;
    if (Array.isArray(payload.responses)) return payload;
  }
  if (Array.isArray(record.responses)) return record;
  const inner = record.payload;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const payload = inner as Record<string, unknown>;
    if (Array.isArray(payload.responses)) return payload;
  }
  return null;
}

const Q6B_10_ITEM = "Political information gathered through social media";

function asResponseRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function responseQid(value: unknown): string {
  const record = asResponseRecord(value);
  return typeof record?.qid === "string" ? record.qid : "";
}

/**
 * Older FTV completes omit Q6b_10 (9 non-economic rows). The DB trigger
 * still requires 44–46 response entries, so pad a blank grid row.
 */
export function padFtvResponsesForContract(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!Array.isArray(payload.responses)) return payload;
  const responses = [...payload.responses];
  const qids = new Set(responses.map(responseQid).filter(Boolean));
  if (!qids.has("Q6b_1") || qids.has("Q6b_10")) return payload;

  const stub: Record<string, unknown> = {
    qid: "Q6b_10",
    item: Q6B_10_ITEM,
    type: "grid",
    answer: null,
    question: `Non-economic factors – ${Q6B_10_ITEM}`,
    item_code: 10,
    answer_code: null,
  };
  const afterNine = responses.findIndex((row) => responseQid(row) === "Q6b_9");
  if (afterNine >= 0) responses.splice(afterNine + 1, 0, stub);
  else responses.push(stub);
  return { ...payload, responses };
}

const Q_KEY = /^Q\d/i;
const OTHER_INSTRUMENT_KEY = /^Q(1[8-9]|[2-9]\d)$/;
const FTV_SHAPED_KEY = /^(Q6a_|Q6b_|Q7_rank|Q15_)/;

/** Q-key map from screener.answers when analytics.__ftv_payload is missing. */
export function wrapQKeyAnswersAsPayload(
  source: unknown,
): Record<string, unknown> | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const record = source as Record<string, unknown>;
  const qEntries = Object.entries(record).filter(([key]) => Q_KEY.test(key));
  if (qEntries.length === 0) return null;
  const responses = qEntries.map(([qid, answer]) => ({
    qid,
    type: Array.isArray(answer) ? "multi" : "single",
    answer,
  }));
  return {
    status: "COMPLETE",
    survey_version: "FTV-v1",
    responses,
  };
}

export function isFtvShapedQKeyMap(source: unknown): boolean {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const keys = Object.keys(source as Record<string, unknown>);
  if (keys.some((key) => FTV_SHAPED_KEY.test(key))) return true;
  if (keys.some((key) => OTHER_INSTRUMENT_KEY.test(key))) return false;
  return keys.some((key) => Q_KEY.test(key));
}
