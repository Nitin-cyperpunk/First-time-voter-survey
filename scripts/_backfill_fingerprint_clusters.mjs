/**
 * Backfill script: flag BOTH sides of every fingerprint duplicate cluster.
 *
 * DO NOT RUN without first reviewing the dry-run output.
 * Run migration 025 before running this script.
 *
 * Usage:
 *   node scripts/_backfill_fingerprint_clusters.mjs --dry-run   (default — prints counts only)
 *   node scripts/_backfill_fingerprint_clusters.mjs --apply      (writes to DB)
 *
 * Idempotent: re-running produces the same result.
 *
 * OPERATIVE RULE:
 *   FINGERPRINT match → both sides ineligible (duplicate_flag=true), excluded
 *   from "clean", no reward.
 *   IP-ONLY match → review flag only, still clean, still payable.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";

const isDryRun = !process.argv.includes("--apply");
const GAMING_PATTERN = "screener_evasion";
const DUPLICATE_REASON = "Duplicate Device Fingerprint";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
import { createClient } from "@supabase/supabase-js";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

console.log(`Mode: ${isDryRun ? "DRY RUN (no writes)" : "⚠️  APPLY (writing to DB)"}`);
console.log("");

// Fetch all participants with a device fingerprint.
const { data: allWithFingerprint, error } = await sb.from("participants")
  .select("lead_id, status, device_fingerprint, duplicate_flag, duplicate_cluster_id, is_fingerprint_cluster_original, original_participant_lead_id, created_at")
  .not("device_fingerprint", "is", null)
  .is("deleted_at", null)
  .order("created_at", { ascending: true });

if (error) { console.error("Fetch error:", error); process.exit(1); }

// Group by fingerprint.
const byFingerprint = new Map();
for (const p of allWithFingerprint) {
  const group = byFingerprint.get(p.device_fingerprint) ?? [];
  group.push(p);
  byFingerprint.set(p.device_fingerprint, group);
}

const multiDevice = [...byFingerprint.values()].filter(g => g.length > 1);

let willFlagOriginals = 0;
let willAssignCluster = 0;
let willMarkGaming = 0;
let alreadyIneligible = 0;

/** Accumulates patches: Map<leadId, partialUpdate> */
const patches = new Map();

function setPatch(leadId, patch) {
  const existing = patches.get(leadId) ?? {};
  patches.set(leadId, { ...existing, ...patch });
}

for (const group of multiDevice) {
  // Sort by created_at ascending — index 0 is the original.
  const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const original = sorted[0];

  // Resolve or mint a cluster ID.
  const existingClusterId = group.find(m => m.duplicate_cluster_id)?.duplicate_cluster_id ?? null;
  const clusterId = existingClusterId ?? randomUUID();

  for (let i = 0; i < sorted.length; i++) {
    const member = sorted[i];
    const isOriginal = i === 0;

    // Determine gaming pattern for non-original members:
    // if ANY earlier member was terminated and this member is not terminated.
    let gamingPattern = null;
    if (!isOriginal && member.status !== "terminated") {
      const hasTerminatedPredecessor = sorted.slice(0, i).some(m => m.status === "terminated");
      if (hasTerminatedPredecessor) gamingPattern = GAMING_PATTERN;
    }

    const needsFlag = !member.duplicate_flag;
    const needsCluster = member.duplicate_cluster_id !== clusterId;
    const needsOriginalMark = isOriginal && !member.is_fingerprint_cluster_original;
    const needsGaming = gamingPattern && !member.duplicate_gaming_pattern;

    if (!needsFlag && !needsCluster && !needsOriginalMark && !needsGaming) continue;

    const patch = {
      duplicate_cluster_id: clusterId,
      is_fingerprint_cluster_original: isOriginal,
    };
    if (needsFlag) {
      patch.duplicate_flag = true;
      patch.duplicate_reason = DUPLICATE_REASON;
      patch.duplicate_detected_at = new Date().toISOString();
      patch.review_status = "Pending";
      // original_participant_lead_id: for non-originals, point to original; for original, null.
      patch.original_participant_lead_id = isOriginal ? null : original.lead_id;
    }
    if (gamingPattern) {
      patch.duplicate_gaming_pattern = gamingPattern;
    }

    setPatch(member.lead_id, patch);

    if (needsFlag && isOriginal) willFlagOriginals++;
    if (needsFlag && !isOriginal) alreadyIneligible++; // already should have been flagged
    if (needsCluster) willAssignCluster++;
    if (needsGaming) willMarkGaming++;
  }
}

console.log("=== BACKFILL IMPACT ===");
console.log(`  Clusters to process: ${multiDevice.length}`);
console.log(`  Records to patch total: ${patches.size}`);
console.log(`  Originals that would be newly flagged ineligible: ${willFlagOriginals}`);
console.log(`  Records that get cluster_id assigned/updated: ${willAssignCluster}`);
console.log(`  Records that get gaming pattern label: ${willMarkGaming}`);
console.log(`  Already-flagged non-originals being re-stamped with cluster_id: ${alreadyIneligible}`);
console.log("");

// Count: currently-clean records that would become ineligible (fingerprint-flagged).
// "Clean" today = duplicate_flag=false. After backfill, originals also get duplicate_flag=true.
const currentlyClean = allWithFingerprint.filter(p => !p.duplicate_flag);
const willBecomeIneligible = [...patches.entries()]
  .filter(([_, patch]) => patch.duplicate_flag === true)
  .map(([id]) => id)
  .filter(id => currentlyClean.some(p => p.lead_id === id));
console.log(`  Currently-clean records that would become ineligible: ${willBecomeIneligible.length}`);
console.log(`  IDs: ${willBecomeIneligible.join(", ")}`);
console.log("");

// Check already-paid records.
const { data: paidRows } = await sb.from("payouts").select("lead_id").eq("payment_status", "paid");
const paidIds = new Set((paidRows ?? []).map(r => r.lead_id));
const newlyIneligibleAndPaid = willBecomeIneligible.filter(id => paidIds.has(id));
console.log("=== 4.3 NEWLY INELIGIBLE + ALREADY PAID (needs human decision) ===");
console.log(`  Count: ${newlyIneligibleAndPaid.length}`);
if (newlyIneligibleAndPaid.length > 0) {
  console.log(`  IDs: ${newlyIneligibleAndPaid.join(", ")}`);
} else {
  console.log("  None — no money has been paid out yet.");
}
console.log("");

if (isDryRun) {
  console.log("DRY RUN complete. Run with --apply to write changes.");
  process.exit(0);
}

// ─── APPLY ───────────────────────────────────────────────────────────────────
console.log("Applying patches...");
let success = 0;
let failed = 0;
for (const [leadId, patch] of patches) {
  const { error: updateError } = await sb.from("participants").update(patch).eq("lead_id", leadId);
  if (updateError) {
    console.error(`  FAILED ${leadId}:`, updateError.message);
    failed++;
  } else {
    success++;
  }
}
console.log(`\nApply complete: ${success} succeeded, ${failed} failed.`);
