/**
 * Phase 1 scan for Referral Payout toggle implementation.
 * node scripts/_scan_referral_payout.mjs
 */
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
import { createClient } from "@supabase/supabase-js";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// 1.4 — referral status breakdown
const { data: allReferrals } = await sb.from("referrals").select("referrer_lead_id,referred_lead_id,reward_status,reward_amount");
const earned = allReferrals.filter(r => r.reward_status === "earned");
const pending = allReferrals.filter(r => r.reward_status === "pending");
const paid = allReferrals.filter(r => r.reward_status === "paid");
console.log("=== 1.4 REFERRAL STATUS COUNTS ===");
console.log(`  total referrals: ${allReferrals.length}`);
console.log(`  earned: ${earned.length}`);
console.log(`  pending: ${pending.length}`);
console.log(`  paid: ${paid.length}`);
console.log(`  other: ${allReferrals.filter(r => !["earned","pending","paid"].includes(r.reward_status)).length}`);

// 1.4 — does pending distinguish terminated vs duplicate-awaiting-QC?
// Check referred participants' statuses for pending referrals
const pendingReferredIds = pending.map(r => r.referred_lead_id).filter(Boolean);
const { data: pendingParticipants } = await sb.from("participants")
  .select("lead_id,status,is_flagged_duplicate,duplicate_flag")
  .in("lead_id", pendingReferredIds.length ? pendingReferredIds : ["__none__"]);
const statusMap = Object.fromEntries((pendingParticipants ?? []).map(p => [p.lead_id, p]));
let terminated = 0, duplicateFlagged = 0, other = 0;
for (const r of pending) {
  const p = statusMap[r.referred_lead_id];
  if (!p) { other++; continue; }
  if (p.status === "terminated") terminated++;
  else if (p.is_flagged_duplicate || p.duplicate_flag) duplicateFlagged++;
  else other++;
}
console.log(`\n  Pending breakdown (referred participant status):`);
console.log(`    terminated (never payable):  ${terminated}`);
console.log(`    duplicate-flagged (QC hold): ${duplicateFlagged}`);
console.log(`    other/clean-completed:       ${other}`);

// 1.6 — stored vs computed amounts
const withAmount = earned.filter(r => r.reward_amount !== null && r.reward_amount !== undefined);
const withoutAmount = earned.filter(r => r.reward_amount === null || r.reward_amount === undefined);
console.log("\n=== 1.6 REWARD AMOUNT STORED vs COMPUTED ===");
console.log(`  earned rows WITH reward_amount stored: ${withAmount.length}`);
console.log(`  earned rows WITHOUT reward_amount:     ${withoutAmount.length}`);
const amounts = [...new Set(withAmount.map(r => Number(r.reward_amount)))].sort((a,b)=>a-b);
console.log(`  distinct stored amounts: ${amounts.join(", ")}`);

// 1.9 — referrers with earned amount > 0: UPI breakdown
// Compute earned per referrer
const earnedByReferrer = new Map();
for (const r of [...earned, ...paid]) {
  const amt = r.reward_amount !== null ? Number(r.reward_amount) : 25; // fallback
  earnedByReferrer.set(r.referrer_lead_id, (earnedByReferrer.get(r.referrer_lead_id) ?? 0) + amt);
}
const referrerIds = [...earnedByReferrer.keys()].filter(Boolean);
const { data: referrerParticipants } = await sb.from("participants")
  .select("lead_id,upi_id,full_name,mobile")
  .in("lead_id", referrerIds.length ? referrerIds : ["__none__"]);
const refMap = Object.fromEntries((referrerParticipants ?? []).map(p => [p.lead_id, p]));

let withUpi = 0, withoutUpi = 0, withUpiAmount = 0, withoutUpiAmount = 0;
for (const [leadId, amount] of earnedByReferrer) {
  const p = refMap[leadId];
  if (p?.upi_id) { withUpi++; withUpiAmount += amount; }
  else { withoutUpi++; withoutUpiAmount += amount; }
}
console.log("\n=== 1.9 UPI AVAILABILITY (referrers with earned amount > 0) ===");
console.log(`  referrers with UPI:     ${withUpi} (₹${withUpiAmount})`);
console.log(`  referrers without UPI:  ${withoutUpi} (₹${withoutUpiAmount})`);
console.log(`  total unique referrers: ${referrerIds.length}`);

// 2.3 — before/after > 0 filter
// All referrers currently in the payout list vs only those with earned > 0
const { data: allParticipants } = await sb.from("participants")
  .select("lead_id", { count: "exact" })
  .is("deleted_at", null);
console.log("\n=== 2.3 ROW COUNT BEFORE/AFTER FILTER ===");
console.log(`  total participants (all): ${allParticipants?.length ?? 0}`);
console.log(`  referrers with earned > 0: ${referrerIds.length}`);

// People under BOTH toggles
// Survey eligible = status in (completed, review_pass, review_fail, successful, unsuccessful, paid)
const surveyStatuses = new Set(["completed","review_pass","review_fail","successful","unsuccessful","paid"]);
const { data: surveyPeople } = await sb.from("participants")
  .select("lead_id,status")
  .is("deleted_at", null)
  .in("status", [...surveyStatuses]);
const surveyIds = new Set((surveyPeople ?? []).map(p => p.lead_id));
const inBoth = referrerIds.filter(id => surveyIds.has(id));
console.log("\n=== BOTH TOGGLES (survey eligible AND referrer with earned > 0) ===");
console.log(`  people in both: ${inBoth.length}`);

// What they are owed under each
if (inBoth.length > 0) {
  // survey earnings: completed/successful = ₹25 (from study config default)
  const { data: bothPeople } = await sb.from("participants")
    .select("lead_id,full_name,status,upi_id")
    .in("lead_id", inBoth);
  console.log("  lead_id | referral_earned | survey_status");
  for (const p of (bothPeople ?? [])) {
    console.log(`  ${p.lead_id} | ₹${earnedByReferrer.get(p.lead_id)} | ${p.status}`);
  }
}
