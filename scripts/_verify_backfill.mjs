import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
import { createClient } from "@supabase/supabase-js";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const ids = ["CI_FTV_0100","CI_FTV_0115","CI_FTV_0125","CI_FTV_0137","CI_FTV_0159","CI_FTV_0164","CI_FTV_0170","CI_FTV_0230","CI_FTV_0232","CI_FTV_0248","CI_FTV_0249","CI_FTV_0262","CI_FTV_0268","CI_FTV_0287","CI_FTV_0002","CI_FTV_0003","CI_FTV_0031"];
const { data } = await sb.from("participants").select("lead_id,full_name,mobile").in("lead_id", ids);
console.log("=== POST-BACKFILL STATE ===");
for (const r of (data ?? [])) {
  console.log(r.lead_id, "| name:", JSON.stringify(r.full_name), "| mobile:", r.mobile ?? "NULL");
}

// also confirm no more 'Anonymous' stored
const { data: stillAnon } = await sb.from("participants").select("lead_id", { count: "exact" }).eq("full_name", "Anonymous");
console.log("\nRows still storing 'Anonymous':", stillAnon?.length ?? 0);
