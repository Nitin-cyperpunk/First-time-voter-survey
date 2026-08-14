/**
 * One-shot heal: copy stored FTV payloads from screener_responses into
 * ftv_responses for completed people Excel currently misses.
 *
 * Pads missing Q6b_10 so the 44–46 trigger accepts 43-entry completes.
 * Does not invent answers for empty screener stubs.
 */
import { createClient } from "@supabase/supabase-js";

const Q6B_10_ITEM = "Political information gathered through social media";

function extractPayload(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const nested = source.__ftv_payload;
  if (nested && typeof nested === "object" && !Array.isArray(nested) && Array.isArray(nested.responses)) {
    return nested;
  }
  if (Array.isArray(source.responses)) return source;
  return null;
}

function padQ6b10(payload) {
  const responses = Array.isArray(payload.responses) ? [...payload.responses] : [];
  const qids = new Set(responses.map((row) => (row && row.qid) || ""));
  if (!qids.has("Q6b_1") || qids.has("Q6b_10")) return { ...payload, responses };
  const stub = {
    qid: "Q6b_10",
    item: Q6B_10_ITEM,
    type: "grid",
    answer: null,
    question: `Non-economic factors – ${Q6B_10_ITEM}`,
    item_code: 10,
    answer_code: null,
  };
  const idx = responses.findIndex((row) => row && row.qid === "Q6b_9");
  if (idx >= 0) responses.splice(idx + 1, 0, stub);
  else responses.push(stub);
  return { ...payload, responses };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: screeners, error: screenerError } = await supabase
    .from("screener_responses")
    .select(
      "lead_id, city_id, answers, analytics, started_at, submitted_at, total_duration_sec, completion_status",
    )
    .eq("completion_status", "Completed");
  if (screenerError) throw screenerError;

  const { data: existing, error: existingError } = await supabase
    .from("ftv_responses")
    .select("lead_id, respondent_id");
  if (existingError) throw existingError;

  const have = new Set();
  for (const row of existing ?? []) {
    if (row.lead_id) have.add(row.lead_id);
    if (row.respondent_id) have.add(row.respondent_id);
  }

  const report = { inserted: [], failed: [], skippedEmpty: [], skippedNoPayload: [] };

  for (const row of screeners ?? []) {
    if (!row.lead_id || have.has(row.lead_id)) continue;
    const raw = extractPayload(row.analytics) ?? extractPayload(row.answers);
    if (!raw) {
      const answerKeys = row.answers && typeof row.answers === "object" ? Object.keys(row.answers).filter((k) => /^Q/i.test(k)) : [];
      if (answerKeys.length === 0) report.skippedEmpty.push(row.lead_id);
      else report.skippedNoPayload.push(row.lead_id);
      continue;
    }

    const payload = padQ6b10({ ...raw, respondent_id: row.lead_id });
    const cityId = row.city_id && String(row.city_id).trim() ? row.city_id : null;
    const { data: rpc, error: rpcErr } = await supabase.rpc("insert_ftv_response", {
      p_respondent_id: row.lead_id,
      p_survey_version: payload.survey_version || "FTV-v1",
      p_status: "COMPLETE",
      p_payload: payload,
      p_started_at: row.started_at,
      p_completed_at: row.submitted_at,
      p_terminated_at: null,
      p_duration_seconds: row.total_duration_sec,
      p_lead_id: row.lead_id,
      p_city_id: cityId,
    });

    if (rpcErr || !rpc?.ok) {
      const rowInsert = {
        respondent_id: row.lead_id,
        lead_id: row.lead_id,
        city_id: cityId,
        survey_version: payload.survey_version || "FTV-v1",
        status: "COMPLETE",
        started_at: row.started_at,
        completed_at: row.submitted_at,
        terminated_at: null,
        duration_seconds: row.total_duration_sec,
        payload,
      };
      const direct = await supabase.from("ftv_responses").insert(rowInsert);
      if (direct.error) {
        report.failed.push({
          lead_id: row.lead_id,
          n: Array.isArray(payload.responses) ? payload.responses.length : 0,
          rpc,
          error: direct.error.message,
        });
        continue;
      }
    }
    have.add(row.lead_id);
    report.inserted.push(row.lead_id);
  }

  const { count: ftvCount } = await supabase
    .from("ftv_responses")
    .select("*", { count: "exact", head: true })
    .eq("status", "COMPLETE");
  const { count: screenerCount } = await supabase
    .from("screener_responses")
    .select("*", { count: "exact", head: true })
    .eq("completion_status", "Completed");

  console.log(JSON.stringify({
    inserted: report.inserted,
    failed: report.failed,
    skippedEmpty: report.skippedEmpty,
    skippedNoPayload: report.skippedNoPayload,
    ftvComplete: ftvCount,
    screenerCompleted: screenerCount,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
