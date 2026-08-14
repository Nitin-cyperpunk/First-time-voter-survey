import {
  extractStoredFtvPayload,
  isFtvShapedQKeyMap,
  padFtvResponsesForContract,
  wrapQKeyAnswersAsPayload,
} from "@/lib/ftv-payload";
import type { FtvAnswerRow, FtvRespondentRow } from "@/lib/ftv-export/pivot";

export type RecoveredScreener = {
  lead_id: string;
  city_id: string | null;
  city_raw: string | null;
  city_match_type: string | null;
  answers: unknown;
  analytics: unknown;
  started_at: string | null;
  submitted_at: string | null;
  total_duration_sec: number | null;
};

export type RecoveredParticipant = {
  lead_id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  city: string | null;
  city_id: string | null;
  area: string | null;
  pincode: string | null;
  dob: string | null;
  created_at: string | null;
};

export function ftvAnswersFromPayloadResponses(
  respondentId: string,
  responses: unknown[],
): FtvAnswerRow[] {
  const rows: FtvAnswerRow[] = [];
  for (const entry of responses) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const qid = typeof rec.qid === "string" ? rec.qid : "";
    if (!qid) continue;
    rows.push({
      respondent_id: respondentId,
      qid,
      question_type: typeof rec.type === "string" ? rec.type : null,
      item:
        typeof rec.item === "string"
          ? rec.item
          : typeof rec.option === "string"
            ? rec.option
            : null,
      item_code: typeof rec.item_code === "number" ? rec.item_code : null,
      rank_position: typeof rec.rank === "number" ? rec.rank : null,
      selection_order:
        typeof rec.selection_order === "number" ? rec.selection_order : null,
      answer_code: typeof rec.answer_code === "number" ? rec.answer_code : null,
      answer:
        rec.answer === null || rec.answer === undefined
          ? null
          : typeof rec.answer === "string"
            ? rec.answer
            : JSON.stringify(rec.answer),
      other_text: typeof rec.other_text === "string" ? rec.other_text : null,
      answer_original:
        typeof rec.answer_original === "string" ? rec.answer_original : null,
      answer_script: typeof rec.script === "string" ? rec.script : null,
      spoken_language:
        typeof rec.spoken_language === "string" ? rec.spoken_language : null,
    });
  }
  return rows;
}

export function recoverFtvPayloadFromScreener(
  screener: Pick<RecoveredScreener, "answers" | "analytics">,
): Record<string, unknown> | null {
  const stored =
    extractStoredFtvPayload(screener.analytics) ??
    extractStoredFtvPayload(screener.answers);
  if (stored) return padFtvResponsesForContract(stored);
  if (!isFtvShapedQKeyMap(screener.answers)) return null;
  return wrapQKeyAnswersAsPayload(screener.answers);
}

export function recoverFtvAnswers(
  respondentId: string,
  screener: Pick<RecoveredScreener, "answers" | "analytics">,
): FtvAnswerRow[] {
  const payload = recoverFtvPayloadFromScreener(screener);
  if (!payload || !Array.isArray(payload.responses)) return [];
  return ftvAnswersFromPayloadResponses(respondentId, payload.responses);
}

export function recoverFtvRespondent(input: {
  screener: RecoveredScreener;
  participant?: RecoveredParticipant | null;
}): FtvRespondentRow {
  const { screener, participant } = input;
  const payload = recoverFtvPayloadFromScreener(screener);
  const profile =
    payload?.profile && typeof payload.profile === "object" && !Array.isArray(payload.profile)
      ? (payload.profile as Record<string, unknown>)
      : {};
  const cityId = screener.city_id || participant?.city_id || null;
  const name =
    (typeof profile.name === "string" && profile.name) ||
    participant?.full_name ||
    "";
  const email =
    (typeof profile.email === "string" && profile.email) ||
    participant?.email ||
    "";
  const phone =
    (typeof profile.phone === "string" && profile.phone) ||
    participant?.mobile ||
    "";
  const city =
    (typeof profile.city === "string" && profile.city) ||
    participant?.city ||
    screener.city_raw ||
    "";

  return {
    respondent_id: screener.lead_id,
    lead_id: screener.lead_id,
    city_id: cityId,
    survey_version:
      typeof payload?.survey_version === "string" ? payload.survey_version : "FTV-v1",
    status: typeof payload?.status === "string" ? payload.status : "COMPLETE",
    started_at: screener.started_at,
    completed_at: screener.submitted_at,
    terminated_at: null,
    duration_seconds: screener.total_duration_sec,
    created_at: participant?.created_at ?? screener.submitted_at,
    name,
    email,
    phone,
    area: (typeof profile.area === "string" && profile.area) || participant?.area || "",
    city,
    zip:
      (typeof profile.zip === "string" && profile.zip) || participant?.pincode || "",
    dob: (typeof profile.dob === "string" && profile.dob) || participant?.dob || "",
  };
}
