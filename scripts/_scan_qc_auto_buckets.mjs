/**
 * Phase 1.8 — QC auto bucket counts (read-only)
 * node scripts/_scan_qc_auto_buckets.mjs
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

function computeAutoQc(row) {
  const terminated = (row.status ?? "").toLowerCase() === "terminated";
  const fp = row.duplicate_flag === true;
  const ipOnly =
    row.is_flagged_duplicate === true && row.duplicate_flag !== true;
  if (fp) return "fail";
  if (terminated || ipOnly) return "review";
  return "pass";
}

const { data: rows, error } = await sb
  .from("participants")
  .select(
    "lead_id, status, duplicate_flag, is_flagged_duplicate, duplicate_gaming_pattern, is_fingerprint_cluster_original, duplicate_cluster_id",
  )
  .is("deleted_at", null);
if (error) throw error;

const buckets = { pass: 0, fail: 0, review: 0 };
const reviewBreakdown = { terminated: 0, ipOnly: 0, both: 0 };
let screenerEvasion = 0;
let screenerEvasionOriginals = 0;
let clusterMembers = 0;
let clusterOriginals = 0;

for (const r of rows ?? []) {
  const auto = computeAutoQc(r);
  buckets[auto]++;

  if (r.duplicate_gaming_pattern === "screener_evasion") screenerEvasion++;
  if (r.is_fingerprint_cluster_original === true) clusterOriginals++;
  if (r.duplicate_cluster_id) clusterMembers++;
  if (r.duplicate_flag === true) {
    /* fingerprint cluster member */
  }

  const terminated = (r.status ?? "").toLowerCase() === "terminated";
  const ipOnly =
    r.is_flagged_duplicate === true && r.duplicate_flag !== true;
  if (auto === "review") {
    if (terminated && ipOnly) reviewBreakdown.both++;
    else if (terminated) reviewBreakdown.terminated++;
    else if (ipOnly) reviewBreakdown.ipOnly++;
  }
  if (
    r.duplicate_gaming_pattern === "screener_evasion" &&
    r.is_fingerprint_cluster_original === true
  ) {
    screenerEvasionOriginals++;
  }
}

// Payout survey: isDeliverableClean equivalent
const QUALIFIED = [
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
];
function isDeliverableClean(row) {
  const s = (row.status ?? "").toLowerCase();
  if (!QUALIFIED.includes(s)) return false;
  if (row.duplicate_flag === true) return false;
  if (s === "review_fail" || s === "unsuccessful") return false;
  return true;
}
const deliverableClean = (rows ?? []).filter(isDeliverableClean);
const autoPassDeliverable = deliverableClean.filter(
  (r) => computeAutoQc(r) === "pass",
);

const { data: cfg } = await sb
  .from("form_settings")
  .select("study_config")
  .eq("form_type", "registration")
  .maybeSingle();
const rate = cfg?.study_config?.survey_reward_amount ?? 75;

console.log(
  JSON.stringify(
    {
      total: rows?.length ?? 0,
      autoBuckets: buckets,
      reviewBreakdown,
      screenerEvasionMarker: screenerEvasion,
      screenerEvasionOnOriginals: screenerEvasionOriginals,
      fingerprintClusterMembers_via_duplicate_flag: (rows ?? []).filter(
        (r) => r.duplicate_flag === true,
      ).length,
      rowsWith_duplicate_cluster_id: clusterMembers,
      clusterOriginals,
      coreCase_originalsWithDuplicateFlag: (rows ?? []).filter(
        (r) =>
          r.is_fingerprint_cluster_original === true &&
          r.duplicate_flag === true,
      ).length,
      payoutSurveyDeliverableClean: deliverableClean.length,
      autoPassAmongDeliverable: autoPassDeliverable.length,
      deliverableRupeeValueAtRate: deliverableClean.length * rate,
      survey_reward_amount: rate,
    },
    null,
    2,
  ),
);
