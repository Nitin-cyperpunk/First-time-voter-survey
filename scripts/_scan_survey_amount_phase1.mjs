/**
 * Phase 1 read-only scan: survey amount diagnosis
 * node scripts/_scan_survey_amount_phase1.mjs
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

const SURVEY_PAYOUT_STATUSES = new Set([
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
]);

function surveyEarningsForStatus(row, surveyRewardAmount) {
  const normalized = (row.status ?? "").toLowerCase();
  const isQcFail = normalized === "review_fail" || normalized === "unsuccessful";
  const qualified = SURVEY_PAYOUT_STATUSES.has(normalized);
  const clean = row.duplicate_flag !== true;
  return qualified && clean && !isQcFail ? surveyRewardAmount : 0;
}

// Study config rate
const { data: settingsRow } = await sb
  .from("form_settings")
  .select("study_config")
  .eq("form_type", "registration")
  .maybeSingle();
const studyConfig = settingsRow?.study_config ?? {};
const surveyRewardAmount = studyConfig.survey_reward_amount ?? "(missing — default 50 in code)";

// All participants
const { data: allRows, error: allErr } = await sb
  .from("participants")
  .select(
    "lead_id, full_name, status, review_status, upi_id, duplicate_flag, is_flagged_duplicate, created_at",
  )
  .is("deleted_at", null)
  .order("created_at", { ascending: false });
if (allErr) throw allErr;

const surveyEligible = (allRows ?? []).filter((r) =>
  SURVEY_PAYOUT_STATUSES.has((r.status ?? "").toLowerCase()),
);
const cleanSurvey = surveyEligible.filter((r) => r.duplicate_flag !== true);

const sample20 = cleanSurvey.slice(0, 20).map((r) => ({
  lead_id: r.lead_id,
  name: r.full_name,
  status: r.status,
  review_status: r.review_status,
  survey_amount_column: "NOT IN SCHEMA — computed at read time",
  computed_surveyEarnings: surveyEarningsForStatus(
    r,
    typeof surveyRewardAmount === "number" ? surveyRewardAmount : 50,
  ),
  upi_id: r.upi_id ? "(present)" : null,
  created_at: r.created_at,
}));

const statusBreakdown = {};
for (const r of cleanSurvey) {
  const s = (r.status ?? "unknown").toLowerCase();
  statusBreakdown[s] = (statusBreakdown[s] ?? 0) + 1;
}

const computedBreakdown = {};
for (const r of cleanSurvey) {
  const amt = surveyEarningsForStatus(
    r,
    typeof surveyRewardAmount === "number" ? surveyRewardAmount : 50,
  );
  computedBreakdown[amt] = (computedBreakdown[amt] ?? 0) + 1;
}

// Check referrals reward_amount for comparison
const { data: referrals } = await sb
  .from("referrals")
  .select("reward_amount, reward_status")
  .eq("reward_status", "earned");
const referralAmountBreakdown = {};
for (const r of referrals ?? []) {
  const k = r.reward_amount ?? "NULL";
  referralAmountBreakdown[k] = (referralAmountBreakdown[k] ?? 0) + 1;
}

// Paid participants count (dashboard)
const paidCount = (allRows ?? []).filter(
  (r) => (r.status ?? "").toLowerCase() === "paid",
).length;

const successfulRows = (allRows ?? []).filter(
  (r) => (r.status ?? "").toLowerCase() === "successful",
);
const successfulSample = successfulRows.map((r) => ({
  lead_id: r.lead_id,
  status: r.status,
  duplicate_flag: r.duplicate_flag,
  computed_surveyEarnings: surveyEarningsForStatus(r, typeof surveyRewardAmount === "number" ? surveyRewardAmount : 50),
}));

console.log(
  JSON.stringify(
    {
      allParticipantStatusCounts: Object.fromEntries(
        Object.entries(
          (allRows ?? []).reduce((acc, r) => {
            const s = (r.status ?? "unknown").toLowerCase();
            acc[s] = (acc[s] ?? 0) + 1;
            return acc;
          }, {}),
        ),
      ),
      phase1_1_sample20_cleanSurveyToggle: sample20,
      phase1_2_computedAmountGroupBy: computedBreakdown,
      phase1_3_anyNonZeroComputed: Object.keys(computedBreakdown).some(
        (k) => Number(k) > 0,
      ),
      phase1_4_survey_amount_column: "ABSENT from participants table — no stored column",
      config: {
        survey_reward_amount: surveyRewardAmount,
        referral_reward_amount: studyConfig.referral_reward_amount ?? "(missing)",
      },
      surveyToggleCounts: {
        surveyEligible: surveyEligible.length,
        cleanSurvey: cleanSurvey.length,
        statusBreakdownAmongClean: statusBreakdown,
      },
      referralComparison: {
        earnedReferrals: referrals?.length ?? 0,
        reward_amount_breakdown: referralAmountBreakdown,
      },
      dashboardPaidStatusCount: paidCount,
      successfulParticipants: successfulSample,
    },
    null,
    2,
  ),
);
