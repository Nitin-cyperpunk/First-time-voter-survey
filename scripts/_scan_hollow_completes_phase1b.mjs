/**
 * Phase 1 supplement — qKey=2 boundary + hollow timestamps + cap
 * node scripts/_scan_hollow_completes_phase1b.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^['"]|['"]$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: participants } = await sb.from("participants").select("lead_id,status,duplicate_flag,created_at").is("deleted_at", null);
const { data: screeners } = await sb.from("screener_responses").select("lead_id,answers,analytics,completion_status,submitted_at").is("deleted_at", null);
const { data: ftvRows } = await sb.from("ftv_responses").select("lead_id,payload").is("deleted_at", null);
const { data: statusHist } = await sb.from("status_history").select("lead_id,old_status,new_status,changed_at,changed_by,notes");

const screenerByLead = new Map((screeners??[]).map(r=>[r.lead_id,r]));
const ftvByLead = new Map((ftvRows??[]).map(r=>[r.lead_id,r]));

function qKeys(answers) {
  if (!answers || typeof answers !== "object") return [];
  return Object.keys(answers).filter(k=>/^Q/i.test(k));
}

const completed = (participants??[]).filter(p=>(p.status??"").toLowerCase()==="completed");

const rows = completed.map(p => {
  const sc = screenerByLead.get(p.lead_id);
  const keys = qKeys(sc?.answers);
  const answers = sc?.answers ?? {};
  const keyDetails = keys.map(k => ({ k, v: answers[k] }));
  const ftv = ftvByLead.get(p.lead_id);
  const payloadLen = ftv?.payload?.responses?.length ?? 0;
  const hist = (statusHist??[]).filter(h=>h.lead_id===p.lead_id);
  const wasCorrected = hist.some(h => h.old_status && h.old_status !== "completed" && h.new_status === "completed");
  return { lead_id: p.lead_id, qKeyCount: keys.length, keyDetails, submitted_at: sc?.submitted_at, completion_status: sc?.completion_status, payloadLen, duplicate_flag: p.duplicate_flag, wasCorrected, hist };
});

const q0 = rows.filter(r=>r.qKeyCount===0);
const q2 = rows.filter(r=>r.qKeyCount===2);
const q43plus = rows.filter(r=>r.qKeyCount>=43);

// status transitions registered->completed without prior in-progress
const bulkTransitions = (statusHist??[]).filter(h => h.new_status==="completed" && h.old_status && !["in_progress","started"].includes(h.old_status));

console.log("=== HOLLOW qKey=0 (all 20) ===");
console.log(JSON.stringify(q0.map(r=>({lead_id:r.lead_id, submitted_at:r.submitted_at, duplicate_flag:r.duplicate_flag, wasCorrected:r.wasCorrected})), null, 2));

console.log("\n=== BOUNDARY qKey=2 (all 30) ===");
console.log(JSON.stringify(q2.map(r=>({lead_id:r.lead_id, keys:r.keyDetails, submitted_at:r.submitted_at, payloadLen:r.payloadLen, duplicate_flag:r.duplicate_flag})), null, 2));

console.log("\n=== qKey=2 submitted_at hour buckets ===");
const buckets = {};
for (const r of q2) {
  const b = r.submitted_at?.slice(0,13) ?? "none";
  buckets[b] = (buckets[b]??0)+1;
}
console.log(buckets);

console.log("\n=== qKey=0 submitted_at hour buckets ===");
const b0 = {};
for (const r of q0) {
  const b = r.submitted_at?.slice(0,13) ?? "none";
  b0[b] = (b0[b]??0)+1;
}
console.log(b0);

console.log("\n=== Non-system completed transitions ===");
console.log(JSON.stringify(bulkTransitions.slice(0,20), null, 2));
console.log("count:", bulkTransitions.length);

console.log("\n=== registered->completed where old was registered ===");
const regToComp = (statusHist??[]).filter(h => h.old_status==="registered" && h.new_status==="completed");
console.log("count:", regToComp.length);
const regBuckets = {};
for (const h of regToComp) {
  const b = h.changed_at?.slice(0,13) ?? "?";
  regBuckets[b] = (regBuckets[b]??0)+1;
}
console.log("buckets:", regBuckets);

console.log("\n=== Summary counts ===");
console.log({ completed: completed.length, q0: q0.length, q2: q2.length, q43plus: q43plus.length });
