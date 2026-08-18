/**
 * Find completes whose IST clock is 00:00–05:30
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

const { data, error } = await sb
  .from("ftv_responses")
  .select("respondent_id, completed_at, started_at, created_at")
  .is("deleted_at", null)
  .not("completed_at", "is", null)
  .order("completed_at", { ascending: true })
  .limit(500);
if (error) throw error;

const hits = (data ?? []).filter((r) => {
  const ist = new Date(r.completed_at).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // en-GB gives HH:MM
  const [h, m] = ist.split(":").map(Number);
  return h < 5 || (h === 5 && m <= 30);
});
console.log("total scanned", data?.length, "early IST hits", hits.length);
console.log(JSON.stringify(hits.slice(0, 8), null, 2));
