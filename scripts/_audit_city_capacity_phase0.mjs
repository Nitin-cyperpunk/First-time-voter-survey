/**
 * Per-city remaining capacity (read-only) for Phase 0.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^['"]|['"]$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: cities } = await sb.from("cities").select("id, name, state, capacity, is_open, area_type").eq("is_active", true);
const { data: screeners } = await sb.from("screener_responses").select("city_id, completion_status").is("deleted_at", null).eq("completion_status", "Completed");

const counts = {};
for (const r of screeners ?? []) {
  if (!r.city_id) continue;
  counts[r.city_id] = (counts[r.city_id] ?? 0) + 1;
}

const rows = (cities ?? []).map((c) => {
  const achieved = counts[c.id] ?? 0;
  const cap = c.capacity ?? 0;
  return { name: c.name, state: c.state, achieved, cap, remaining: cap - achieved, is_open: c.is_open };
}).sort((a, b) => a.remaining - b.remaining);

const full = rows.filter((r) => r.remaining <= 0);
const tight = rows.filter((r) => r.remaining > 0 && r.remaining <= 2);
console.log(JSON.stringify({
  cities: rows.length,
  full_or_over: full.length,
  remaining_le_2: tight,
  full: full.slice(0, 15),
  unmatched_completed: (screeners ?? []).filter((s) => !s.city_id).length,
  total_screener_completed: (screeners ?? []).length,
}, null, 2));
