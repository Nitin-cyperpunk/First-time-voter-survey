/**
 * Phase 1 — hollow completed scan (read-only)
 * node scripts/_scan_hollow_completes_phase1.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const QUALIFIED = [
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
];

/** Top-level FTV question ids (17 substantive blocks). */
const TOP_LEVEL_QIDS = new Set([
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "Q5",
  "Q6a",
  "Q6b",
  "Q7",
  "Q8",
  "Q9",
  "Q10",
  "Q11",
  "Q12",
  "Q13",
  "Q14",
  "Q15_1",
  "Q15_2",
  "Q15_3",
  "Q16",
  "Q17",
]);

function isNonEmpty(v) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.some(isNonEmpty);
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

function countAnswerKeys(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { totalKeys: 0, qKeys: 0, topLevel: 0, keys: [] };
  }
  const keys = Object.keys(answers).filter((k) => /^Q/i.test(k));
  const nonEmptyKeys = keys.filter((k) => isNonEmpty(answers[k]));
  let topLevel = 0;
  for (const k of nonEmptyKeys) {
    const base = k.match(/^(Q\d+[a-z]?|Q\d+_\d+)/i)?.[1]?.toUpperCase();
    if (base && TOP_LEVEL_QIDS.has(base)) topLevel++;
    else if (nonEmptyKeys.includes(k)) {
      // grid items Q6a_1 etc. — count parent via prefix
      if (/^Q6a_/i.test(k)) topLevel++;
      else if (/^Q6b_/i.test(k)) topLevel++;
      else if (/^Q14_/i.test(k)) topLevel++;
      else if (/^Q8_/i.test(k)) topLevel++;
      else if (/^Q7_rank/i.test(k)) topLevel++;
    }
  }
  // dedupe top-level-ish count: use unique parent groups
  const parents = new Set();
  for (const k of nonEmptyKeys) {
    if (/^Q6a_/i.test(k)) parents.add("Q6a");
    else if (/^Q6b_/i.test(k)) parents.add("Q6b");
    else if (/^Q14_/i.test(k)) parents.add("Q14");
    else if (/^Q8_/i.test(k)) parents.add("Q8");
    else if (/^Q7_rank/i.test(k)) parents.add("Q7");
    else if (/^Q15_/i.test(k)) parents.add(k.split("_").slice(0, 2).join("_"));
    else parents.add(k.match(/^Q\d+/i)?.[0] ?? k);
  }
  return {
    totalKeys: Object.keys(answers).length,
    qKeys: nonEmptyKeys.length,
    topLevel: parents.size,
    keys: nonEmptyKeys,
  };
}

function payloadResponseCount(analytics, answers) {
  const src = analytics ?? answers;
  if (!src || typeof src !== "object") return 0;
  const nested = src.__ftv_payload ?? src;
  if (Array.isArray(nested.responses)) {
    return nested.responses.filter(
      (r) => r && r.qid && isNonEmpty(r.answer ?? r.answer_code),
    ).length;
  }
  return 0;
}

const { data: participants, error: pErr } = await sb
  .from("participants")
  .select(
    "lead_id, full_name, mobile, dob, city, status, upi_id, duplicate_flag, is_flagged_duplicate, created_at",
  )
  .is("deleted_at", null);
if (pErr) throw pErr;

const { data: screeners, error: sErr } = await sb
  .from("screener_responses")
  .select(
    "lead_id, answers, analytics, completion_status, termination_reason, submitted_at, started_at, total_duration_sec",
  )
  .is("deleted_at", null);
if (sErr) throw sErr;

const { data: ftvRows, error: fErr } = await sb
  .from("ftv_responses")
  .select("lead_id, status, payload, completed_at, created_at")
  .is("deleted_at", null);
if (fErr) throw fErr;

const { data: statusHist, error: hErr } = await sb
  .from("status_history")
  .select("lead_id, old_status, new_status, changed_at, changed_by, notes")
  .order("changed_at", { ascending: false });
if (hErr) throw hErr;

const { data: payouts, error: payErr } = await sb
  .from("payouts")
  .select("lead_id, payment_status");
if (payErr) throw payErr;

const screenerByLead = new Map((screeners ?? []).map((r) => [r.lead_id, r]));
const ftvByLead = new Map((ftvRows ?? []).map((r) => [r.lead_id, r]));
const paidLeads = new Set(
  (payouts ?? []).filter((p) => p.payment_status === "paid").map((p) => p.lead_id),
);

const completedOnly = (participants ?? []).filter(
  (p) => (p.status ?? "").toLowerCase() === "completed",
);
const qualified = (participants ?? []).filter((p) =>
  QUALIFIED.includes((p.status ?? "").toLowerCase()),
);

const enriched = completedOnly.map((p) => {
  const sc = screenerByLead.get(p.lead_id);
  const ftv = ftvByLead.get(p.lead_id);
  const ans = countAnswerKeys(sc?.answers);
  const payloadCount = payloadResponseCount(sc?.analytics, sc?.answers);
  const ftvPayloadCount = ftv?.payload
    ? payloadResponseCount(ftv.payload, null)
    : 0;
  const hasDemo =
    Boolean(p.full_name?.trim()) &&
    p.full_name.trim() !== "Anonymous" &&
    Boolean(p.mobile?.trim()) &&
    Boolean(p.dob?.trim()) &&
    Boolean(p.city?.trim());
  const hasAnyDemo =
    Boolean(p.full_name?.trim()) ||
    Boolean(p.mobile?.trim()) ||
    Boolean(p.dob?.trim()) ||
    Boolean(p.city?.trim());
  const answersEmpty =
    !sc ||
    !sc.answers ||
    (typeof sc.answers === "object" &&
      !Array.isArray(sc.answers) &&
      Object.keys(sc.answers).length === 0) ||
    JSON.stringify(sc.answers) === "{}" ||
    sc.answers === null;
  const hist = (statusHist ?? []).filter((h) => h.lead_id === p.lead_id);

  return {
    lead_id: p.lead_id,
    status: p.status,
    created_at: p.created_at,
    screener_submitted_at: sc?.submitted_at ?? null,
    completion_status: sc?.completion_status ?? null,
    qKeyCount: ans.qKeys,
    topLevelParents: ans.topLevel,
    payloadResponses: Math.max(payloadCount, ftvPayloadCount),
    hasScreener: Boolean(sc),
    answersEmpty,
    hasDemo,
    hasAnyDemo,
    upi: Boolean(p.upi_id?.trim()),
    duplicate_flag: p.duplicate_flag === true,
    paid: paidLeads.has(p.lead_id),
    statusHistory: hist.slice(0, 5),
  };
});

// Distribution by topLevel parent count
const distTop = {};
const distQkeys = {};
for (const r of enriched) {
  distTop[r.topLevelParents] = (distTop[r.topLevelParents] ?? 0) + 1;
  distQkeys[r.qKeyCount] = (distQkeys[r.qKeyCount] ?? 0) + 1;
}

// Hollow candidates: no screener OR empty answers OR very low top-level (< 5?)
const hollowNoScreener = enriched.filter((r) => !r.hasScreener);
const hollowEmptyAnswers = enriched.filter((r) => r.answersEmpty);
const hollowLowTop = enriched.filter((r) => r.topLevelParents <= 2);
const hollowNoPayload = enriched.filter(
  (r) => r.payloadResponses === 0 && r.qKeyCount <= 2,
);
const hollowStrict = enriched.filter(
  (r) =>
    r.answersEmpty ||
    !r.hasScreener ||
    (r.qKeyCount === 0 && r.payloadResponses === 0),
);

// status history bulk patterns
const toCompleted = (statusHist ?? []).filter(
  (h) => (h.new_status ?? "").toLowerCase() === "completed",
);
const histByTime = {};
for (const h of toCompleted) {
  const bucket = h.changed_at?.slice(0, 16) ?? "unknown";
  histByTime[bucket] = (histByTime[bucket] ?? 0) + 1;
}
const histWithNotes = toCompleted.filter((h) => h.notes?.trim());
const histManual = toCompleted.filter(
  (h) =>
    (h.changed_by ?? "").toLowerCase() !== "system" ||
    /manual|fix|heal|correct|admin/i.test(h.notes ?? ""),
);

// Clean deliverable among qualified
function computeAutoQc(p) {
  if (p.duplicate_flag) return "fail";
  return "pass";
}
const realCompletes = enriched.filter((r) => !hollowStrict.some((h) => h.lead_id === r.lead_id));
const realClean = realCompletes.filter((r) => !r.duplicate_flag);

const cfg = (
  await sb
    .from("form_settings")
    .select("study_config")
    .eq("form_type", "registration")
    .maybeSingle()
).data?.study_config;
const cap = (cfg?.target ?? 200) + (cfg?.buffer ?? 30);

console.log(
  JSON.stringify(
    {
      headline: {
        completes_status_completed: completedOnly.length,
        qualified_completes_all_statuses: qualified.length,
        hollow_strict_to_exclude: hollowStrict.length,
        real_completes_remaining: completedOnly.length - hollowStrict.length,
        real_clean_not_fingerprint: realClean.length,
        current_dashboard_clean_approx: qualified.filter(
          (p) => p.duplicate_flag !== true,
        ).length,
        paid_hollow: hollowStrict.filter((r) => r.paid).length,
        cap_closesAt: cap,
        clean_shortfall_vs_cap: Math.max(
          0,
          cap - realClean.length,
        ),
      },
      phase1_1_completed_count: completedOnly.length,
      phase1_2_distribution_topLevelParents: distTop,
      phase1_2_distribution_qKeyCount: distQkeys,
      phase1_3_empty_answers: {
        no_screener_row: hollowNoScreener.length,
        answers_null_or_empty_object: hollowEmptyAnswers.length,
        qKeyCount_0_2: enriched.filter((r) => r.qKeyCount <= 2).length,
        qKeyCount_0: enriched.filter((r) => r.qKeyCount === 0).length,
      },
      phase1_4_timestamps: {
        participants_no_updated_at_column: true,
        screener_submitted_at_buckets: Object.fromEntries(
          Object.entries(
            enriched.reduce((acc, r) => {
              const b = r.screener_submitted_at?.slice(0, 13) ?? "none";
              acc[b] = (acc[b] ?? 0) + 1;
              return acc;
            }, {}),
          ).sort(),
        ),
        status_history_to_completed_by_minute: Object.fromEntries(
          Object.entries(histByTime).sort().slice(-20),
        ),
        status_history_manual_or_non_system: histManual.length,
        sample_manual_history: histManual.slice(0, 10),
      },
      phase1_5_completion_markers: {
        participants_has_status_source_field: false,
        review_status_legacy_only: true,
        status_history_notes_sample: histWithNotes.slice(0, 8),
      },
      phase1_6_demographics: {
        hollow_strict_no_demographics: hollowStrict.filter((r) => !r.hasAnyDemo)
          .length,
        hollow_strict_with_demographics_no_answers: hollowStrict.filter(
          (r) => r.hasAnyDemo && (r.answersEmpty || r.qKeyCount === 0),
        ).length,
        hollow_strict_with_full_demo: hollowStrict.filter((r) => r.hasDemo)
          .length,
      },
      hollow_strict_sample10: hollowStrict.slice(0, 10),
      boundary_outside_strict_qKeys_3_to_5: enriched
        .filter((r) => r.qKeyCount >= 3 && r.qKeyCount <= 5 && !hollowStrict.some((h) => h.lead_id === r.lead_id))
        .slice(0, 5),
      phase1_8_paid: {
        hollow_paid_count: hollowStrict.filter((r) => r.paid).length,
        hollow_paid_leads: hollowStrict.filter((r) => r.paid).map((r) => r.lead_id),
      },
    },
    null,
    2,
  ),
);
