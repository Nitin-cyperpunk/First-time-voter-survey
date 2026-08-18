/**
 * Phase 1 — export timestamp diagnosis (read-only)
 * node scripts/_scan_export_timestamps_phase1.mjs
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

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function cell(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

const { data: rows, error } = await sb
  .from("ftv_responses")
  .select("respondent_id, lead_id, started_at, completed_at, terminated_at, created_at, status")
  .is("deleted_at", null)
  .not("completed_at", "is", null)
  .order("completed_at", { ascending: false })
  .limit(8);
if (error) throw error;

const { data: midnightish } = await sb
  .from("ftv_responses")
  .select("respondent_id, lead_id, started_at, completed_at, terminated_at, created_at")
  .is("deleted_at", null)
  .not("completed_at", "is", null)
  .order("completed_at", { ascending: true })
  .limit(40);

const earlyIst = (midnightish ?? []).filter((r) => {
  const d = new Date(r.completed_at);
  const utcH = d.getUTCHours();
  const utcM = d.getUTCMinutes();
  // IST 00:00–05:29 = UTC 18:30–23:59 previous day
  return utcH >= 18 || (utcH === 18 && utcM >= 30) || utcH < 0;
});

console.log("=== 1.1 EXPORT VALUES (current pivot: String(iso)) ===");
for (const r of rows ?? []) {
  console.log({
    respondent_id: r.respondent_id,
    started_at_export: cell(r.started_at),
    completed_at_export: cell(r.completed_at),
    terminated_at_export: cell(r.terminated_at),
    created_at_export: cell(r.created_at),
  });
}

console.log("\n=== 1.2 STORED VALUES (same rows, raw from PostgREST) ===");
for (const r of rows ?? []) {
  console.log({
    respondent_id: r.respondent_id,
    started_at: r.started_at,
    completed_at: r.completed_at,
    terminated_at: r.terminated_at,
    created_at: r.created_at,
  });
}

const { data: types, error: tErr } = await sb.rpc("count_qualified_completions", {
  p_city_id: null,
});
if (tErr) console.log("rpc probe:", tErr.message);

// information_schema via a trivial SQL isn't available; infer from migration + sample suffix
console.log("\n=== SAMPLE SUFFIX CHECK ===");
const sample = rows?.[0];
console.log({
  completed_at_raw: sample?.completed_at,
  endsWithZ: String(sample?.completed_at ?? "").endsWith("Z"),
  hasOffset: /[+-]\d{2}:\d{2}$/.test(String(sample?.completed_at ?? "")),
});

console.log("\n=== ADMIN UI FORMATTER (formatAdminDateTime equivalent) ===");
for (const r of (rows ?? []).slice(0, 3)) {
  const d = new Date(r.completed_at);
  const ui = d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  console.log({
    respondent_id: r.respondent_id,
    stored: r.completed_at,
    export_now: cell(r.completed_at),
    admin_ui: ui,
  });
}

console.log("\n=== CANDIDATES 00:00-05:30 IST (UTC 18:30-23:59) ===");
const window = (midnightish ?? []).filter((r) => {
  const d = new Date(r.completed_at);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return h > 18 || (h === 18 && m >= 30);
});
console.log("count in first 40 earliest completes:", window.length);
for (const r of window.slice(0, 5)) {
  const d = new Date(r.completed_at);
  console.log({
    respondent_id: r.respondent_id,
    stored: r.completed_at,
    utc: d.toISOString(),
    ist: d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }),
  });
}

const { data: parts } = await sb
  .from("participants")
  .select("lead_id, created_at")
  .is("deleted_at", null)
  .order("created_at", { ascending: false })
  .limit(3);
console.log("\n=== PARTICIPANTS created_at (list export source) ===");
console.log(parts);
