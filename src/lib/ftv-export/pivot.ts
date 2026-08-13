import type { ExportRow } from "@/lib/export";
import {
  FTV_EXPORT_HEADERS,
  Q6A_HEADERS,
  Q6B_HEADERS,
  Q8_HEADERS,
  Q14_HEADERS,
} from "@/lib/ftv-export/catalog";

export type FtvAnswerRow = {
  respondent_id?: string | null;
  qid?: string | null;
  question_type?: string | null;
  item?: string | null;
  item_code?: number | null;
  rank_position?: number | null;
  selection_order?: number | null;
  answer_code?: number | null;
  answer?: string | null;
  other_text?: string | null;
  answer_original?: string | null;
  answer_script?: string | null;
  spoken_language?: string | null;
};

export type FtvRespondentRow = {
  respondent_id?: string | null;
  lead_id?: string | null;
  city_id?: string | null;
  city_area_type?: string | null;
  city_state?: string | null;
  quota_cell?: string | null;
  survey_version?: string | null;
  status?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  terminated_at?: string | null;
  duration_seconds?: number | null;
  created_at?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  area?: string | null;
  city?: string | null;
  age_band?: string | null;
  state_code?: number | null;
  state?: string | null;
  zip?: string | null;
  dob?: string | null;
  age_today?: number | null;
  age_at_poll?: number | null;
  age_at_qualifying_date?: number | null;
  gender_code?: number | null;
  gender?: string | null;
  relationship_code?: number | null;
  relationship_status?: string | null;
  state_match?: boolean | null;
  consent?: string | null;
  terms_accepted?: boolean | null;
  randomisation_seed?: number | null;
  order_q6_blocks?: unknown;
  order_q6a?: unknown;
  order_q6b?: unknown;
  order_q14?: unknown;
};

function cell(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function findByQid(answers: FtvAnswerRow[], qid: string): FtvAnswerRow | undefined {
  return answers.find((row) => row.qid === qid);
}

function gridCode(
  answers: FtvAnswerRow[],
  qid: string,
  itemCode: number,
): string | number {
  const byQid = findByQid(answers, qid);
  if (byQid?.answer_code !== null && byQid?.answer_code !== undefined) {
    return byQid.answer_code;
  }
  const prefix = qid.replace(/_\d+$/, "");
  const byItem = answers.find(
    (row) =>
      row.item_code === itemCode &&
      (row.qid === qid ||
        row.qid?.startsWith(`${prefix}_`) ||
        (row.question_type === "grid" && row.qid?.startsWith(prefix))),
  );
  if (byItem?.answer_code !== null && byItem?.answer_code !== undefined) {
    return byItem.answer_code;
  }
  return "";
}

function singlePair(answers: FtvAnswerRow[], qid: string): {
  code: string | number;
  label: string | number;
  other: string | number;
} {
  const row = findByQid(answers, qid);
  return {
    code: cell(row?.answer_code ?? ""),
    label: cell(row?.answer ?? ""),
    other: cell(row?.other_text ?? ""),
  };
}

function rankPair(answers: FtvAnswerRow[], rank: number): {
  code: string | number;
  label: string | number;
  other: string | number;
} {
  const row =
    findByQid(answers, `Q7_rank${rank}`) ??
    answers.find(
      (item) =>
        item.rank_position === rank ||
        (item.question_type === "rank" && item.qid?.endsWith(String(rank))),
    );
  return {
    code: cell(row?.answer_code ?? ""),
    label: cell(row?.answer ?? ""),
    other: cell(row?.other_text ?? ""),
  };
}

function q8Rows(answers: FtvAnswerRow[]): FtvAnswerRow[] {
  return answers.filter(
    (row) =>
      row.question_type === "multi" ||
      (typeof row.qid === "string" && /^Q8(?:_|$)/.test(row.qid)),
  );
}

export function emptyFtvExportRow(): ExportRow {
  const row: ExportRow = {};
  for (const header of FTV_EXPORT_HEADERS) {
    row[header] = "";
  }
  for (const header of Q8_HEADERS) {
    row[header] = 0;
  }
  row.Q8_count = 0;
  return row;
}

export function pivotFtvWideRow(
  respondent: FtvRespondentRow,
  answers: FtvAnswerRow[],
): ExportRow {
  const row = emptyFtvExportRow();

  row.respondent_id = cell(respondent.respondent_id);
  row.survey_version = cell(respondent.survey_version);
  row.status = cell(respondent.status);
  row.started_at = cell(respondent.started_at);
  row.completed_at = cell(respondent.completed_at);
  row.terminated_at = cell(respondent.terminated_at);
  row.duration_seconds = cell(respondent.duration_seconds);
  row.consent = cell(respondent.consent);
  row.terms_accepted = cell(respondent.terms_accepted);
  row.randomisation_seed = cell(respondent.randomisation_seed);
  row.order_q6_blocks = cell(respondent.order_q6_blocks);
  row.order_q6a = cell(respondent.order_q6a);
  row.order_q6b = cell(respondent.order_q6b);
  row.order_q14 = cell(respondent.order_q14);
  row.state_match = cell(respondent.state_match);
  row.created_at = cell(respondent.created_at);

  row.name = cell(respondent.name);
  row.email = cell(respondent.email);
  row.phone = cell(respondent.phone);
  row.area = cell(respondent.area);
  row.city = cell(respondent.city);
  row.city_id = cell(respondent.city_id);
  row.city_area_type = cell(respondent.city_area_type);
  row.city_state = cell(respondent.city_state);
  row.quota_cell = cell(respondent.quota_cell);
  row.state_code = cell(respondent.state_code);
  row.state = cell(respondent.state);
  row.zip = cell(respondent.zip);
  row.age_band = cell(respondent.age_band);
  row.dob = cell(respondent.dob);
  row.age_today = cell(respondent.age_today);
  row.age_at_poll = cell(respondent.age_at_poll);
  row.age_at_qualifying_date = cell(respondent.age_at_qualifying_date);
  row.gender_code = cell(respondent.gender_code);
  row.gender = cell(respondent.gender);
  row.relationship_code = cell(respondent.relationship_code);
  row.relationship_status = cell(respondent.relationship_status);

  for (const qid of ["Q1", "Q2", "Q3", "Q4", "Q5", "Q9", "Q10", "Q11", "Q12", "Q13", "Q15_1", "Q15_2", "Q16"] as const) {
    const pair = singlePair(answers, qid);
    row[`${qid}_code`] = pair.code;
    row[qid] = pair.label;
  }

  const q15_3 = singlePair(answers, "Q15_3");
  row.Q15_3_code = q15_3.code;
  row.Q15_3 = q15_3.label;
  row.Q15_3_other = q15_3.other;

  Q6A_HEADERS.forEach((header, index) => {
    row[header] = gridCode(answers, `Q6a_${index + 1}`, index + 1);
  });
  Q6B_HEADERS.forEach((header, index) => {
    row[header] = gridCode(answers, `Q6b_${index + 1}`, index + 1);
  });
  Q14_HEADERS.forEach((header, index) => {
    row[header] = gridCode(answers, `Q14_${index + 1}`, index + 1);
  });

  for (const rank of [1, 2, 3] as const) {
    const pair = rankPair(answers, rank);
    row[`Q7_rank${rank}_code`] = pair.code;
    row[`Q7_rank${rank}`] = pair.label;
    row[`Q7_rank${rank}_other`] = pair.other;
  }

  const chosen = q8Rows(answers).filter(
    (item) => item.answer_code !== null && item.answer_code !== undefined,
  );
  let otherText = "";
  for (const item of chosen) {
    const code = Number(item.answer_code);
    if (!Number.isInteger(code) || code < 1 || code > Q8_HEADERS.length) continue;
    row[Q8_HEADERS[code - 1]!] = 1;
    if (code === 18 && item.other_text) otherText = String(item.other_text);
  }
  const ordered = [...chosen]
    .map((item) => ({
      code: Number(item.answer_code),
      order: item.selection_order ?? Number(item.answer_code) ?? 0,
    }))
    .filter((item) => Number.isInteger(item.code) && item.code >= 1 && item.code <= Q8_HEADERS.length)
    .sort((a, b) => a.order - b.order)
    .map((item) => item.code);

  row.Q8_other = otherText;
  row.Q8_selection_order = ordered.join("|");
  row.Q8_count = ordered.length;

  const q17 = findByQid(answers, "Q17");
  row.Q17 = cell(q17?.answer ?? "");
  row.Q17_original = cell(q17?.answer_original ?? "");
  row.Q17_script = cell(q17?.answer_script ?? "");
  row.Q17_spoken_language = cell(q17?.spoken_language ?? "");

  return row;
}

export function pivotFtvWideRows(
  respondents: FtvRespondentRow[],
  answers: FtvAnswerRow[],
): ExportRow[] {
  const byRespondent = new Map<string, FtvAnswerRow[]>();
  for (const answer of answers) {
    const id = answer.respondent_id;
    if (!id) continue;
    const list = byRespondent.get(id) ?? [];
    list.push(answer);
    byRespondent.set(id, list);
  }

  return respondents
    .filter((row) => row.respondent_id)
    .map((respondent) =>
      pivotFtvWideRow(
        respondent,
        byRespondent.get(respondent.respondent_id!) ?? [],
      ),
    );
}
