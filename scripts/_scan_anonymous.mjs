/**
 * Phase 1 scan: measure scope of anonymous/missing-mobile rows.
 * node scripts/_scan_anonymous.mjs
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

import { createClient } from "@supabase/supabase-js";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 1.1 affected rows
const { data: affected, error: e1 } = await sb
  .from("participants")
  .select(
    "lead_id,full_name,mobile,upi_id,dob,city,status,acquisition_type,referral_platform,created_at",
  )
  .or("full_name.is.null,full_name.eq.,full_name.eq.Anonymous,mobile.is.null,mobile.eq.")
  .order("created_at", { ascending: false });
if (e1) {
  console.error(e1);
  process.exit(1);
}

const { count: total } = await sb
  .from("participants")
  .select("*", { count: "exact", head: true });

console.log("=== 1.1 AFFECTED ROWS ===");
console.log("Affected count:", affected.length, "/ Total:", total);

// 1.2 cross-tab by type x status
const tab = {};
for (const r of affected) {
  const key = `${r.acquisition_type || "unknown"} × ${r.status}`;
  tab[key] = (tab[key] || 0) + 1;
}
console.log("\n=== 1.2 CROSS-TAB (acquisition_type × status) ===");
for (const [k, v] of Object.entries(tab)) console.log(" ", k, "=>", v);

// 1.3 created_at timestamp — check if table has updated_at
console.log("\n=== 1.3 SAMPLE ROWS (first 8 affected) ===");
for (const r of affected.slice(0, 8)) {
  console.log(
    r.lead_id,
    "| created:", r.created_at,
    "| name:", JSON.stringify(r.full_name),
    "| mobile:", r.mobile ?? "NULL",
    "| dob:", r.dob ?? "NULL",
    "| city:", r.city ?? "NULL",
  );
}

// 1.4 field presence table
let dob = 0, city = 0, upi = 0, mobile = 0, realName = 0;
for (const r of affected) {
  if (r.dob) dob++;
  if (r.city) city++;
  if (r.upi_id) upi++;
  if (r.mobile) mobile++;
  if (r.full_name && r.full_name !== "Anonymous" && r.full_name !== "") realName++;
}
const n = affected.length;
console.log("\n=== 1.4 FIELD POPULATION (affected rows only) ===");
console.log(` dob:       ${dob}/${n} (${pct(dob, n)}%)`);
console.log(` city:      ${city}/${n} (${pct(city, n)}%)`);
console.log(` upi_id:    ${upi}/${n} (${pct(upi, n)}%)`);
console.log(` mobile:    ${mobile}/${n} (${pct(mobile, n)}%)`);
console.log(` real name: ${realName}/${n} (${pct(realName, n)}%)`);
function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }

// 1.5 date clustering
const dateCounts = {};
for (const r of affected) {
  const d = r.created_at.slice(0, 10);
  dateCounts[d] = (dateCounts[d] || 0) + 1;
}
console.log("\n=== 1.5 DATE CLUSTERING ===");
for (const [d, c] of Object.entries(dateCounts).sort()) console.log(" ", d, "=>", c);

// 1.6 "Anonymous" stored vs NULL
const { data: anonRows } = await sb
  .from("participants")
  .select("lead_id", { count: "exact" })
  .eq("full_name", "Anonymous");
const { data: nullRows } = await sb
  .from("participants")
  .select("lead_id", { count: "exact" })
  .is("full_name", null);
const { data: emptyRows } = await sb
  .from("participants")
  .select("lead_id", { count: "exact" })
  .eq("full_name", "");
console.log("\n=== 1.6 NAME BREAKDOWN ===");
console.log(` full_name = 'Anonymous': ${anonRows?.length ?? 0}`);
console.log(` full_name IS NULL:       ${nullRows?.length ?? 0}`);
console.log(` full_name = '':          ${emptyRows?.length ?? 0}`);

// 1.7 UPI overlap
const bothMissing = affected.filter((r) => !r.mobile && !r.upi_id);
const noUpi = affected.filter((r) => !r.upi_id);
console.log("\n=== 1.7 UPI OVERLAP ===");
console.log(` affected missing BOTH mobile and upi: ${bothMissing.length}`);
console.log(` affected missing upi_id:              ${noUpi.length}/${n}`);
console.log(` affected WITH upi_id:                 ${upi}/${n}`);

// 6.x Data impact
const { data: completed } = await sb
  .from("participants")
  .select("lead_id,mobile,upi_id,referral_code", { count: "exact" })
  .eq("status", "completed");
const completedNoMobile = completed?.filter((r) => !r.mobile) ?? [];
const completedNoUpi = completed?.filter((r) => !r.upi_id) ?? [];
console.log("\n=== 6.x DATA IMPACT (completed only) ===");
console.log(` total completed: ${completed?.length ?? 0}`);
console.log(` completed without mobile: ${completedNoMobile.length} (${pct(completedNoMobile.length, completed?.length ?? 1)}%)`);
console.log(` completed without upi_id: ${completedNoUpi.length} (${pct(completedNoUpi.length, completed?.length ?? 1)}%)`);

// referrers with no mobile
if (completedNoMobile.length) {
  const codes = completedNoMobile.map((r) => r.referral_code).filter(Boolean);
  // check if any referrals were attributed to these
  const { data: referrals } = await sb
    .from("referrals")
    .select("referrer_lead_id")
    .in(
      "referrer_lead_id",
      completedNoMobile.map((r) => r.lead_id),
    );
  const withReferrals = new Set(referrals?.map((r) => r.referrer_lead_id) ?? []);
  console.log(` completed with no mobile who have referrals attributed: ${withReferrals.size}`);
}
