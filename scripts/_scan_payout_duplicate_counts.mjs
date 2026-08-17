/**
 * Phase 1.6 — payout duplicate counts by match type.
 * Usage: npx tsx --env-file=.env scripts/_scan_payout_duplicate_counts.mjs
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
        l.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
      ];
    }),
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const SURVEY = new Set([
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
]);

function matchType(row) {
  const ip = row.is_flagged_duplicate === true;
  const fp = row.duplicate_flag === true;
  if (ip && fp) return "both";
  if (ip) return "ip";
  if (fp) return "fingerprint";
  return "none";
}

function tally(rows) {
  const counts = {
    total: rows.length,
    flagged: 0,
    clean: 0,
    ip: 0,
    fingerprint: 0,
    both: 0,
    nullIpAndNullFp: 0,
    falseIpAndFalseFp: 0,
  };
  for (const row of rows) {
    const type = matchType(row);
    if (type === "none") counts.clean += 1;
    else counts.flagged += 1;
    if (type === "ip") counts.ip += 1;
    if (type === "fingerprint") counts.fingerprint += 1;
    if (type === "both") counts.both += 1;
    if (row.is_flagged_duplicate == null && row.duplicate_flag == null) {
      counts.nullIpAndNullFp += 1;
    }
    if (row.is_flagged_duplicate === false && row.duplicate_flag === false) {
      counts.falseIpAndFalseFp += 1;
    }
  }
  return counts;
}

const { data, error } = await sb
  .from("participants")
  .select(
    "lead_id, status, is_flagged_duplicate, duplicate_flag, original_participant_lead_id, deleted_at",
  )
  .is("deleted_at", null);

if (error) {
  console.error(error);
  process.exit(1);
}

const all = data ?? [];
const survey = all.filter((row) =>
  SURVEY.has(String(row.status ?? "").toLowerCase()),
);

console.log("=== ALL non-deleted participants (Referral roster) ===");
console.log(JSON.stringify(tally(all), null, 2));
console.log("=== SURVEY-eligible statuses ===");
console.log(JSON.stringify(tally(survey), null, 2));
console.log("=== flagged+clean vs total (all) ===");
const a = tally(all);
console.log({ flaggedPlusClean: a.flagged + a.clean, total: a.total });
console.log("=== flagged+clean vs total (survey) ===");
const s = tally(survey);
console.log({ flaggedPlusClean: s.flagged + s.clean, total: s.total });

const oldestNull = all.find(
  (row) => row.is_flagged_duplicate == null && row.duplicate_flag == null,
);
console.log("=== sample NULL duplicate fields ===");
console.log(oldestNull ?? "none — no NULL pair; checking individual NULLs");
const anyNullIp = all.filter((row) => row.is_flagged_duplicate == null).length;
const anyNullFp = all.filter((row) => row.duplicate_flag == null).length;
console.log({ anyNullIp, anyNullFp });
