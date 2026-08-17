import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

import {
  FTV_ANSWER_HEADERS,
  FTV_EXPORT_HEADERS,
  FTV_METADATA_HEADERS,
  FTV_PROFILE_HEADERS,
  Q6B_HEADERS,
  Q8_HEADERS,
  buildFtvCodebook,
  itemHeader,
} from "@/lib/ftv-export/catalog";
import {
  pivotFtvWideRow,
  type FtvAnswerRow,
  type FtvRespondentRow,
} from "@/lib/ftv-export/pivot";

type SamplePayload = {
  survey_version: string;
  respondent_id: string;
  status: string;
  terminated_at: string | null;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number;
  consent: string;
  terms_accepted: boolean;
  randomisation_seed: number;
  display_order: Record<string, unknown>;
  state_match: boolean | null;
  profile: Record<string, unknown>;
  responses: Array<Record<string, unknown>>;
};

function loadSample(name: string): SamplePayload {
  return JSON.parse(
    readFileSync(join(process.cwd(), "docs", "ftv", name), "utf8"),
  ) as SamplePayload;
}

function answersFromPayload(payload: SamplePayload): FtvAnswerRow[] {
  return payload.responses.map((entry) => ({
    respondent_id: payload.respondent_id,
    qid: String(entry.qid ?? ""),
    question_type: typeof entry.type === "string" ? entry.type : null,
    item:
      typeof entry.item === "string"
        ? entry.item
        : typeof entry.option === "string"
          ? entry.option
          : null,
    item_code: typeof entry.item_code === "number" ? entry.item_code : null,
    rank_position: typeof entry.rank === "number" ? entry.rank : null,
    selection_order:
      typeof entry.selection_order === "number" ? entry.selection_order : null,
    answer_code: typeof entry.answer_code === "number" ? entry.answer_code : null,
    answer: typeof entry.answer === "string" ? entry.answer : null,
    other_text: typeof entry.other_text === "string" ? entry.other_text : null,
    answer_original:
      typeof entry.answer_original === "string" ? entry.answer_original : null,
    answer_script: typeof entry.script === "string" ? entry.script : null,
    spoken_language:
      typeof entry.spoken_language === "string" ? entry.spoken_language : null,
  }));
}

function respondentFromPayload(payload: SamplePayload): FtvRespondentRow {
  const profile = payload.profile ?? {};
  const state = (profile.state ?? {}) as { code?: number; label?: string };
  const gender = (profile.gender ?? {}) as { code?: number; label?: string };
  const relationship = (profile.relationship_status ?? {}) as {
    code?: number;
    label?: string;
  };
  return {
    respondent_id: payload.respondent_id,
    lead_id: payload.respondent_id,
    city_id: "city-mumbai",
    city_area_type: "urban",
    city_state: "Maharashtra",
    quota_cell: "Maharashtra|urban",
    survey_version: payload.survey_version,
    status: payload.status,
    started_at: payload.started_at,
    completed_at: payload.completed_at,
    terminated_at: payload.terminated_at,
    duration_seconds: payload.duration_seconds,
    created_at: payload.completed_at ?? payload.terminated_at,
    name: typeof profile.name === "string" ? profile.name : null,
    email: typeof profile.email === "string" ? profile.email : null,
    phone: typeof profile.phone === "string" ? profile.phone : null,
    area: typeof profile.area === "string" ? profile.area : null,
    city: typeof profile.city === "string" ? profile.city : null,
    age_band: typeof profile.age_band === "string" ? profile.age_band : null,
    state_code: state.code ?? null,
    state: state.label ?? null,
    zip: typeof profile.zip === "string" ? profile.zip : null,
    dob: typeof profile.dob === "string" ? profile.dob : null,
    age_today: typeof profile.age_today === "number" ? profile.age_today : null,
    age_at_poll: typeof profile.age_at_poll === "number" ? profile.age_at_poll : null,
    age_at_qualifying_date:
      typeof profile.age_at_qualifying_date === "number"
        ? profile.age_at_qualifying_date
        : null,
    gender_code: gender.code ?? null,
    gender: gender.label ?? null,
    relationship_code: relationship.code ?? null,
    relationship_status: relationship.label ?? null,
    state_match: payload.state_match,
    consent: payload.consent,
    terms_accepted: payload.terms_accepted,
    randomisation_seed: payload.randomisation_seed,
    order_q6_blocks: payload.display_order.Q6_blocks,
    order_q6a: payload.display_order.Q6a,
    order_q6b: payload.display_order.Q6b,
    order_q14: payload.display_order.Q14,
  };
}

test("FTV export header count is 16 + 24 + 89 + 3 = 132", () => {
  assert.equal(FTV_METADATA_HEADERS.length, 16);
  assert.equal(FTV_PROFILE_HEADERS.length, 24);
  assert.equal(FTV_ANSWER_HEADERS.length, 89);
  assert.equal(FTV_EXPORT_HEADERS.length, 132);
  assert.equal(new Set(FTV_EXPORT_HEADERS).size, 132);
});

test("Q6b_10 header keys on item_code text after typo fix", () => {
  assert.equal(
    Q6B_HEADERS[9],
    itemHeader("Q6b_10", "Political information gathered through social media"),
  );
  assert.equal(Q6B_HEADERS[9]?.includes("thsrough"), false);
});

test("complete sample pivots Q8 binaries, grids by item_code, and other text", () => {
  const payload = loadSample("sample_payload.json");
  const row = pivotFtvWideRow(
    respondentFromPayload(payload),
    answersFromPayload(payload),
  );

  assert.equal(Object.keys(row).length, FTV_EXPORT_HEADERS.length);
  assert.equal(row.respondent_id, "CI_FTV_0001");
  assert.equal(row.status, "COMPLETE");
  assert.equal(row.terminated_at, "");
  assert.equal(row.Q1_code, 1);
  assert.equal(row.Q1, "Yes");
  assert.equal(row[Q6B_HEADERS[9]!], 3);
  assert.equal(row[Q8_HEADERS[3]!], 1);
  assert.equal(row[Q8_HEADERS[4]!], 1);
  assert.equal(row[Q8_HEADERS[17]!], 1);
  assert.equal(row[Q8_HEADERS[0]!], 0);
  assert.equal(row.Q8_selection_order, "4|5|18");
  assert.equal(row.Q8_count, 3);
  assert.equal(row.Q8_other, "College WhatsApp group");
  assert.equal(row.Q7_rank3_other, "Local water supply");
  assert.equal(row.Q15_3_other, "Diploma in Journalism");
  assert.equal(row.city_area_type, "urban");
  assert.equal(row.city_state, "Maharashtra");
  assert.equal(row.quota_cell, "Maharashtra|urban");
  assert.equal(row.Q15_2, "City");
  assert.notEqual(row.city_area_type, row.Q15_2);
});

test("terminate sample keeps 44 null answers and zero Q8 selections", () => {
  const payload = loadSample("sample_payload_terminate.json");
  const row = pivotFtvWideRow(
    respondentFromPayload(payload),
    answersFromPayload(payload),
  );

  assert.equal(row.respondent_id, "CI_FTV_0002");
  assert.equal(row.status, "TERMINATE_AGE_OUT_OF_RANGE");
  assert.equal(row.completed_at, "");
  assert.equal(row.terminated_at, "2026-08-13T10:05:02.000Z");
  assert.equal(row.duration_seconds, 51);
  assert.equal(row.Q1_code, "");
  assert.equal(row.Q1, "");
  assert.equal(row[Q6B_HEADERS[9]!], "");
  assert.equal(row.Q8_count, 0);
  assert.equal(row.Q8_selection_order, "");
  for (const header of Q8_HEADERS) {
    assert.equal(row[header], 0);
  }
});

test("codebook is one row per option and includes Q6b_10 through text", () => {
  const codebook = buildFtvCodebook();
  assert.ok(codebook.length > 50);
  assert.ok(
    codebook.some(
      (row) =>
        row.qid === "Q6b_10" &&
        String(row.label).includes("Political information gathered through social media"),
    ),
  );
  assert.equal(
    codebook.some((row) => String(row.label).includes("thsrough")),
    false,
  );
});
