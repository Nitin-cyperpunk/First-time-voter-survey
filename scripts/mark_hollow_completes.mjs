/**
 * Mark hollow completed records (survey_data_incomplete = true).
 *
 * Identification rule (must match src/lib/respondents/survey-completeness.ts):
 *   status = 'completed' (or any qualified completion — see QUALIFIED below)
 *   AND screener_responses.answers is null/empty
 *   AND zero answered items in ftv_responses.payload or screener analytics payload
 *
 * Usage:
 *   node scripts/mark_hollow_completes.mjs              # dry-run (default)
 *   node scripts/mark_hollow_completes.mjs --dry-run
 *   node scripts/mark_hollow_completes.mjs --apply
 *   node scripts/mark_hollow_completes.mjs --revert      # clear flag on matched rows
 *
 * Idempotent: skips rows already flagged. Revert only touches rows flagged by this rule.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply") && !args.has("--revert");
const revert = args.has("--revert");

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

const REASON =
  "Hollow complete: screener answers empty and no FTV survey payload (network/status fix batch).";

function isAnswersEmpty(answers) {
  if (answers == null) return true;
  const t = JSON.stringify(answers);
  return t === "{}" || t === "null" || t === '""';
}

function payloadAnswerCount(source) {
  if (!source || typeof source !== "object") return 0;
  const nested = source.__ftv_payload ?? source;
  const responses = nested.responses;
  if (!Array.isArray(responses)) return 0;
  return responses.filter(
    (r) => r && r.qid && (r.answer != null || r.answer_code != null),
  ).length;
}

function isHollowComplete(participant, screener, ftv) {
  if (!QUALIFIED.includes((participant.status ?? "").toLowerCase())) return false;
  const emptyAns = isAnswersEmpty(screener?.answers);
  const surveyItems = Math.max(
    payloadAnswerCount(screener?.analytics),
    payloadAnswerCount(ftv?.payload),
  );
  return emptyAns && surveyItems === 0;
}

const { data: participants, error: pErr } = await sb
  .from("participants")
  .select("lead_id, status")
  .is("deleted_at", null)
  .in("status", QUALIFIED);
if (pErr) throw pErr;

const { data: screeners, error: sErr } = await sb
  .from("screener_responses")
  .select("lead_id, answers, analytics")
  .is("deleted_at", null);
if (sErr) throw sErr;

const { data: ftvRows, error: fErr } = await sb
  .from("ftv_responses")
  .select("lead_id, payload")
  .is("deleted_at", null);
if (fErr) throw fErr;

const scBy = new Map((screeners ?? []).map((r) => [r.lead_id, r]));
const ftvBy = new Map((ftvRows ?? []).map((r) => [r.lead_id, r]));

const matched = (participants ?? []).filter((p) =>
  isHollowComplete(p, scBy.get(p.lead_id), ftvBy.get(p.lead_id)),
);

console.log(
  JSON.stringify(
    {
      mode: revert ? "revert" : dryRun ? "dry-run" : "apply",
      matched_by_rule: matched.length,
      would_touch: matched.length,
      lead_ids: matched.map((p) => p.lead_id),
      note: "Apply migration 027 before --apply (adds survey_data_incomplete column).",
    },
    null,
    2,
  ),
);

if (dryRun) {
  console.log("\nNo writes (dry-run). Pass --apply after migration 027 + rule confirmation.");
  process.exit(0);
}

// --apply / --revert require migration 027
const { data: flagged, error: flagErr } = await sb
  .from("participants")
  .select("lead_id, survey_data_incomplete")
  .is("deleted_at", null)
  .in(
    "lead_id",
    matched.map((p) => p.lead_id),
  );
if (flagErr) {
  console.error("Migration 027 required before --apply/--revert:", flagErr.message);
  process.exit(1);
}

const flagBy = new Map((flagged ?? []).map((r) => [r.lead_id, r]));
const toMark = matched.filter((p) => flagBy.get(p.lead_id)?.survey_data_incomplete !== true);

const now = new Date().toISOString();
for (const row of revert ? matched : toMark) {
  const patch = revert
    ? {
        survey_data_incomplete: false,
        survey_data_incomplete_at: null,
        survey_data_incomplete_reason: null,
      }
    : {
        survey_data_incomplete: true,
        survey_data_incomplete_at: now,
        survey_data_incomplete_reason: REASON,
      };
  const { error } = await sb
    .from("participants")
    .update(patch)
    .eq("lead_id", row.lead_id);
  if (error) throw error;
}

console.log(`\n${revert ? "Reverted" : "Marked"} ${revert ? matched.length : toMark.length} row(s).`);
