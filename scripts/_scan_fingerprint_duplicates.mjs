/**
 * Phase 1 scan: fingerprint duplicate pairs — live counts.
 * node scripts/_scan_fingerprint_duplicates.mjs
 */
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
import { createClient } from "@supabase/supabase-js";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Fetch all flagged participants (fingerprint flag only — duplicate_flag=true)
const { data: fpFlagged } = await sb.from("participants")
  .select("lead_id,status,duplicate_flag,is_flagged_duplicate,original_participant_lead_id,created_at,upi_id")
  .eq("duplicate_flag", true)
  .is("deleted_at", null);

console.log("=== 1.1 FINGERPRINT-FLAGGED PARTICIPANTS ===");
console.log(`  Total with duplicate_flag=true: ${fpFlagged?.length ?? 0}`);

// Fetch all participants to look up originals
const { data: allParticipants } = await sb.from("participants")
  .select("lead_id,status,duplicate_flag,is_flagged_duplicate,original_participant_lead_id,created_at,upi_id")
  .is("deleted_at", null);

const byLeadId = new Map((allParticipants ?? []).map(p => [p.lead_id, p]));

// 1.4 — clusters: group by device fingerprint
const { data: fpAll } = await sb.from("participants")
  .select("lead_id,device_fingerprint,status,created_at")
  .is("deleted_at", null)
  .not("device_fingerprint", "is", null);

const byFingerprint = new Map();
for (const p of (fpAll ?? [])) {
  if (!p.device_fingerprint) continue;
  const list = byFingerprint.get(p.device_fingerprint) ?? [];
  list.push(p);
  byFingerprint.set(p.device_fingerprint, list);
}
const multiDevice = [...byFingerprint.values()].filter(g => g.length > 1);
const pairGroups = multiDevice.filter(g => g.length === 2);
const clusterGroups = multiDevice.filter(g => g.length >= 3);

console.log(`\n=== 1.4 DEVICE FINGERPRINT CLUSTERS ===`);
console.log(`  Fingerprints shared by >1 participant: ${multiDevice.length}`);
console.log(`  Pairs (exactly 2): ${pairGroups.length}`);
console.log(`  Clusters (3+):     ${clusterGroups.length}`);
if (clusterGroups.length > 0) {
  for (const g of clusterGroups) {
    const sorted = [...g].sort((a, b) => a.created_at.localeCompare(b.created_at));
    console.log(`    [${g.length}] ${sorted.map(p => `${p.lead_id}(${p.status})`).join(" → ")}`);
  }
}

// 1.7 — originals currently unflagged
let unflaggedOriginals = 0;
const unflaggedOriginalIds = new Set();
for (const flagged of (fpFlagged ?? [])) {
  const origId = flagged.original_participant_lead_id;
  if (!origId) continue;
  const orig = byLeadId.get(origId);
  if (orig && !orig.duplicate_flag) {
    unflaggedOriginals++;
    unflaggedOriginalIds.add(origId);
  }
}
console.log(`\n=== 1.7a UNFLAGGED ORIGINALS ===`);
console.log(`  Currently unflagged original records: ${unflaggedOriginals}`);
console.log(`  IDs: ${[...unflaggedOriginalIds].join(", ")}`);

// 1.7 — gaming pattern: earlier=terminated, later=completed (fingerprint match)
let gamingPattern = 0;
const gamingPairs = [];
for (const group of multiDevice) {
  const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const earliest = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const later = sorted[i];
    if (earliest.status === "terminated" && later.status !== "terminated") {
      gamingPattern++;
      gamingPairs.push({ early: earliest, later });
    }
  }
}
console.log(`\n=== 1.7b GAMING PATTERN (earlier=terminated, later=completed) ===`);
console.log(`  Pairs matching gaming pattern: ${gamingPattern}`);
for (const { early, later } of gamingPairs) {
  console.log(`  ${early.lead_id}(${early.status}) → ${later.lead_id}(${later.status})`);
}

// 1.7 — both-completed fingerprint pairs (legitimate shared-device, money at stake)
let bothCompleted = 0;
const bothCompletedPairs = [];
const surveyStatuses = new Set(["completed","review_pass","review_fail","successful","unsuccessful","paid"]);
for (const group of multiDevice) {
  const completedMembers = group.filter(p => surveyStatuses.has(p.status));
  if (completedMembers.length >= 2) {
    bothCompleted += completedMembers.length;
    bothCompletedPairs.push(completedMembers);
  }
}
console.log(`\n=== 1.7c BOTH-COMPLETED FINGERPRINT PAIRS (shared-device, money at stake) ===`);
console.log(`  Completed participants in fingerprint groups with 2+ completions: ${bothCompleted}`);
for (const members of bothCompletedPairs) {
  console.log(`  Group: ${members.map(p => `${p.lead_id}(${p.status})`).join(", ")}`);
}

// Rupee value at risk (survey earnings for both-completed)
// Use study config default of ₹25 survey reward
const SURVEY_REWARD = 25;
const completedIds = bothCompletedPairs.flat().map(p => p.lead_id);
const { data: referralEarnedRows } = await sb.from("referrals")
  .select("referrer_lead_id,reward_amount")
  .in("referrer_lead_id", completedIds.length ? completedIds : ["__none__"])
  .in("reward_status", ["earned","paid"]);
const refEarnings = new Map();
for (const r of (referralEarnedRows ?? [])) {
  if (!r.referrer_lead_id) continue;
  refEarnings.set(r.referrer_lead_id, (refEarnings.get(r.referrer_lead_id) ?? 0) + Number(r.reward_amount ?? 25));
}
let totalAtRisk = 0;
for (const members of bothCompletedPairs) {
  for (const p of members) {
    const survey = surveyStatuses.has(p.status) ? SURVEY_REWARD : 0;
    const referral = refEarnings.get(p.lead_id) ?? 0;
    totalAtRisk += survey + referral;
  }
}
console.log(`  Total rupee value at risk (survey + referral): ₹${totalAtRisk}`);

// 1.8 — already paid
const { data: paidRows } = await sb.from("payouts")
  .select("lead_id,payment_status")
  .eq("payment_status", "paid");
const paidIds = new Set((paidRows ?? []).map(r => r.lead_id));
const fpFlaggedIds = new Set((fpFlagged ?? []).map(p => p.lead_id));
// newly ineligible = unflagged originals that would get flagged
const newlyIneligible = [...unflaggedOriginalIds];
const newlyIneligibleAndPaid = newlyIneligible.filter(id => paidIds.has(id));
console.log(`\n=== 1.8 ALREADY PAID ===`);
console.log(`  Records with payment_status=paid: ${paidIds.size}`);
console.log(`  Unflagged originals that would newly become ineligible: ${newlyIneligible.length}`);
console.log(`  Of those, already paid: ${newlyIneligibleAndPaid.length}`);
if (newlyIneligibleAndPaid.length > 0) {
  console.log(`  IDs: ${newlyIneligibleAndPaid.join(", ")}`);
}
// Also check existing flagged records that are paid
const fpFlaggedAndPaid = [...fpFlaggedIds].filter(id => paidIds.has(id));
console.log(`  Existing fingerprint-flagged AND paid: ${fpFlaggedAndPaid.length}`);

// 1.2 — match type breakdown
const ipOnly = (allParticipants ?? []).filter(p => p.is_flagged_duplicate && !p.duplicate_flag);
const fpOnly = (allParticipants ?? []).filter(p => !p.is_flagged_duplicate && p.duplicate_flag);
const both = (allParticipants ?? []).filter(p => p.is_flagged_duplicate && p.duplicate_flag);
console.log(`\n=== MATCH TYPE BREAKDOWN (current data) ===`);
console.log(`  IP-only (is_flagged_duplicate=true, duplicate_flag=false): ${ipOnly.length}`);
console.log(`  Fingerprint-only (duplicate_flag=true, is_flagged=false):  ${fpOnly.length}`);
console.log(`  Both flags set:                                             ${both.length}`);
console.log(`  Clean (neither flag):                                       ${(allParticipants ?? []).filter(p => !p.is_flagged_duplicate && !p.duplicate_flag).length}`);
