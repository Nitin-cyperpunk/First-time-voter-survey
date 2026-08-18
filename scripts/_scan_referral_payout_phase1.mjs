import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnvFile(path) {
  const text = fs.readFileSync(path, "utf8");
  const pairs = text
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const idx = line.indexOf("=");
      const key = line.slice(0, idx).trim();
      const raw = line.slice(idx + 1).trim();
      const value = raw.replace(/^['"]|['"]$/g, "");
      return [key, value];
    });
  return Object.fromEntries(pairs);
}

const env = readEnvFile(".env");
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: participants, error: participantsError } = await supabase
  .from("participants")
  .select("lead_id, full_name, mobile, upi_id, status, deleted_at")
  .is("deleted_at", null);
if (participantsError) throw participantsError;

const participantByLead = new Map((participants ?? []).map((p) => [p.lead_id, p]));

const { data: referrals, error: referralsError } = await supabase
  .from("referrals")
  .select("id, referrer_lead_id, referred_lead_id, reward_status, reward_amount, earned_at, created_at");
if (referralsError) throw referralsError;

const referredIds = [...new Set((referrals ?? []).map((r) => r.referred_lead_id).filter(Boolean))];
const { data: referredParticipants, error: referredError } = await supabase
  .from("participants")
  .select("lead_id, status, is_flagged_duplicate, duplicate_flag")
  .in("lead_id", referredIds.length ? referredIds : ["__none__"]);
if (referredError) throw referredError;
const referredByLead = new Map((referredParticipants ?? []).map((p) => [p.lead_id, p]));

let pendingTotal = 0;
let pendingTerminated = 0;
let pendingDuplicate = 0;
let pendingOther = 0;
let earnedCount = 0;
let paidCount = 0;

const earnedOnlyByReferrer = new Map();
const earnedPlusPaidByReferrer = new Map();
const earnedCountByReferrer = new Map();

for (const row of referrals ?? []) {
  const rewardStatus = String(row.reward_status ?? "").toLowerCase();
  const amountRaw = row.reward_amount == null ? NaN : Number(row.reward_amount);
  const amount = Number.isFinite(amountRaw) ? amountRaw : 0;
  const referrerLeadId = row.referrer_lead_id ?? null;
  const referred = row.referred_lead_id ? referredByLead.get(row.referred_lead_id) : null;

  if (rewardStatus === "pending") {
    pendingTotal += 1;
    if ((referred?.status ?? "") === "terminated") {
      pendingTerminated += 1;
    } else if (referred?.is_flagged_duplicate || referred?.duplicate_flag) {
      pendingDuplicate += 1;
    } else {
      pendingOther += 1;
    }
  }

  if (rewardStatus === "earned") {
    earnedCount += 1;
    if (referrerLeadId) {
      earnedOnlyByReferrer.set(
        referrerLeadId,
        (earnedOnlyByReferrer.get(referrerLeadId) ?? 0) + amount,
      );
      earnedCountByReferrer.set(
        referrerLeadId,
        (earnedCountByReferrer.get(referrerLeadId) ?? 0) + 1,
      );
      earnedPlusPaidByReferrer.set(
        referrerLeadId,
        (earnedPlusPaidByReferrer.get(referrerLeadId) ?? 0) + amount,
      );
    }
  } else if (rewardStatus === "paid") {
    paidCount += 1;
    if (referrerLeadId) {
      earnedPlusPaidByReferrer.set(
        referrerLeadId,
        (earnedPlusPaidByReferrer.get(referrerLeadId) ?? 0) + amount,
      );
    }
  }
}

const payableReferrers = [...earnedOnlyByReferrer.entries()].map(([leadId, amount]) => {
  const participant = participantByLead.get(leadId);
  return {
    leadId,
    amount,
    earnedCount: earnedCountByReferrer.get(leadId) ?? 0,
    fullName: participant?.full_name ?? "",
    mobile: participant?.mobile ?? "",
    upiId: participant?.upi_id ?? null,
    status: participant?.status ?? null,
  };
});

const payableWithUpi = payableReferrers.filter((row) => (row.upiId ?? "").trim());
const payableWithoutUpi = payableReferrers.filter((row) => !(row.upiId ?? "").trim());

const totalPayableWithUpi = payableWithUpi.reduce((sum, row) => sum + row.amount, 0);
const totalPayableWithoutUpi = payableWithoutUpi.reduce((sum, row) => sum + row.amount, 0);

const surveyEligibleStatuses = new Set([
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
]);

const surveyOwedByLead = new Map();
for (const participant of participants ?? []) {
  const status = String(participant.status ?? "").toLowerCase();
  if (surveyEligibleStatuses.has(status)) {
    surveyOwedByLead.set(participant.lead_id, 25);
  }
}

const bothToggle = payableReferrers
  .filter((row) => surveyOwedByLead.has(row.leadId))
  .map((row) => ({
    leadId: row.leadId,
    referralAmount: row.amount,
    surveyAmount: surveyOwedByLead.get(row.leadId) ?? 0,
    upiId: row.upiId ?? "",
    fullName: row.fullName,
  }))
  .sort((a, b) => b.referralAmount - a.referralAmount || a.leadId.localeCompare(b.leadId));

const zeroReferralRowsBeforeFilter = (participants ?? []).length;
const positiveReferralRowsAfterFilter = payableReferrers.length;

console.log("=== REFERRAL PAYOUT PHASE 1 SCAN ===");
console.log(JSON.stringify({
  participantsTotal: (participants ?? []).length,
  referralRowsTotal: (referrals ?? []).length,
  rewardStatusCounts: {
    earned: earnedCount,
    paid: paidCount,
    pending: pendingTotal,
  },
  pendingBreakdown: {
    terminated: pendingTerminated,
    duplicateAwaitingReview: pendingDuplicate,
    otherOrUnknown: pendingOther,
  },
  filterImpact: {
    referralToggleRowsBeforePositiveFilter: zeroReferralRowsBeforeFilter,
    referralToggleRowsAfterPositiveFilter: positiveReferralRowsAfterFilter,
  },
  upiAvailabilityForPayableReferrers: {
    payableReferrers: payableReferrers.length,
    withUpi: payableWithUpi.length,
    withoutUpi: payableWithoutUpi.length,
    withUpiAmount: totalPayableWithUpi,
    withoutUpiAmount: totalPayableWithoutUpi,
  },
  bothToggleCount: bothToggle.length,
  bothToggleRows: bothToggle,
  samplePayableTop10: payableReferrers
    .sort((a, b) => b.amount - a.amount || a.leadId.localeCompare(b.leadId))
    .slice(0, 10),
  sampleEarnedPlusPaidDiffTop10: [...earnedPlusPaidByReferrer.entries()]
    .map(([leadId, earnedPlusPaid]) => ({
      leadId,
      earnedOnly: earnedOnlyByReferrer.get(leadId) ?? 0,
      earnedPlusPaid,
      diff: earnedPlusPaid - (earnedOnlyByReferrer.get(leadId) ?? 0),
    }))
    .filter((row) => row.diff !== 0)
    .sort((a, b) => b.diff - a.diff || a.leadId.localeCompare(b.leadId))
    .slice(0, 10),
}, null, 2));
