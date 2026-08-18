/**
 * Verify clean-filter row counts before/after backfill semantics.
 * node scripts/_verify_clean_filter_counts.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: rows } = await sb
  .from("participants")
  .select("lead_id, duplicate_flag, is_flagged_duplicate")
  .is("deleted_at", null);

const all = rows ?? [];
const cleanNew = all.filter((r) => !r.duplicate_flag);
const cleanOld = all.filter((r) => !r.duplicate_flag && !r.is_flagged_duplicate);
const ipReview = all.filter((r) => r.is_flagged_duplicate && !r.duplicate_flag);
const fpFlagged = all.filter((r) => r.duplicate_flag);

console.log(JSON.stringify({
  total: all.length,
  cleanToday_oldDefinition_neitherFlag: cleanOld.length,
  cleanNewDefinition_noFingerprint: cleanNew.length,
  ipReviewOnly: ipReview.length,
  fingerprintFlagged: fpFlagged.length,
  afterBackfillEstimate_clean: cleanNew.length - 41,
}, null, 2));
