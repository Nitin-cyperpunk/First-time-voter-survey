/**
 * One-time backfill: for every participants row that has full_name = 'Anonymous'
 * or mobile IS NULL, look up the real name and phone from ftv_respondents_all
 * and UPDATE participants.
 *
 * Usage: node scripts/_backfill_anonymous_from_ftv.mjs [--dry-run]
 *
 * --dry-run  prints what would be patched without writing anything.
 */
import fs from "node:fs";

const dryRun = process.argv.includes("--dry-run");

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

import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// 1. Fetch all affected participant rows
const { data: affected, error: e1 } = await sb
  .from("participants")
  .select("lead_id,full_name,mobile")
  .or("full_name.is.null,full_name.eq.,full_name.eq.Anonymous,mobile.is.null,mobile.eq.");

if (e1) {
  console.error("Failed to fetch affected participants:", e1);
  process.exit(1);
}

console.log(`Affected participants: ${affected.length}`);

if (affected.length === 0) {
  console.log("Nothing to patch.");
  process.exit(0);
}

const leadIds = affected.map((r) => r.lead_id);

// 2. Fetch matching ftv_respondents_all rows
const { data: ftvRows, error: e2 } = await sb
  .from("ftv_respondents_all")
  .select("lead_id,name,phone")
  .in("lead_id", leadIds);

if (e2) {
  console.error("Failed to fetch ftv_respondents_all:", e2);
  process.exit(1);
}

const ftvByLeadId = new Map((ftvRows ?? []).map((r) => [r.lead_id, r]));
console.log(`ftv_respondents_all matches found: ${ftvByLeadId.size}`);

// 3. Build patch list
let patched = 0;
let skipped = 0;
let noFtv = 0;

for (const p of affected) {
  const ftv = ftvByLeadId.get(p.lead_id);
  if (!ftv) {
    console.log(`  ${p.lead_id}: NO FTV ROW — cannot recover`);
    noFtv++;
    continue;
  }

  const patch = {};
  const isBlankName =
    !p.full_name || p.full_name === "Anonymous" || p.full_name.trim() === "";
  if (isBlankName && ftv.name?.trim()) {
    patch.full_name = ftv.name.trim();
  }
  if (!p.mobile && ftv.phone?.trim()) {
    patch.mobile = ftv.phone.trim();
  }

  if (Object.keys(patch).length === 0) {
    console.log(`  ${p.lead_id}: ftv row exists but name/phone also blank — skipping`);
    skipped++;
    continue;
  }

  console.log(
    `  ${p.lead_id}: patch`,
    Object.entries(patch)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(", "),
    dryRun ? "[DRY RUN]" : "",
  );

  if (!dryRun) {
    const { error } = await sb
      .from("participants")
      .update(patch)
      .eq("lead_id", p.lead_id);

    if (error && error.code === "23505" && patch.mobile) {
      // Mobile conflicts with another row — patch name only
      const namePatch = {};
      if (patch.full_name) namePatch.full_name = patch.full_name;
      if (Object.keys(namePatch).length > 0) {
        console.log(`  ${p.lead_id}: mobile conflict — patching name only`);
        const { error: e2 } = await sb
          .from("participants")
          .update(namePatch)
          .eq("lead_id", p.lead_id);
        if (e2) {
          console.error(`  ${p.lead_id}: name-only UPDATE FAILED`, e2);
        } else {
          patched++;
        }
      } else {
        console.error(`  ${p.lead_id}: UPDATE FAILED`, error);
      }
    } else if (error) {
      console.error(`  ${p.lead_id}: UPDATE FAILED`, error);
    } else {
      patched++;
    }
  } else {
    patched++;
  }
}

console.log(
  `\nDone. Patched: ${patched}, No FTV row: ${noFtv}, Skipped (ftv also blank): ${skipped}`,
);
if (dryRun) console.log("(DRY RUN — no writes made)");
