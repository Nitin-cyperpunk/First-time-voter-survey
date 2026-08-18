/**
 * Phase 1 final — payload-based hollow detection + deliverable counts
 * node scripts/_scan_hollow_completes_final.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^['"]|['"]$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const QUALIFIED = ["completed","review_pass","review_fail","successful","unsuccessful","paid"];

function payloadAnswerCount(payload) {
  if (!payload || typeof payload !== "object") return 0;
  const responses = payload.responses ?? payload.__ftv_payload?.responses;
  if (!Array.isArray(responses)) return 0;
  return responses.filter(r => r && r.qid && (r.answer != null || r.answer_code != null)).length;
}

function isAnswersEmpty(answers) {
  if (answers == null) return true;
  const t = JSON.stringify(answers);
  return t === "{}" || t === "null" || t === '""' || t === "";
}

const { data: participants } = await sb.from("participants").select("lead_id,status,duplicate_flag,is_flagged_duplicate,full_name,mobile,dob,city,upi_id,qc_status_override").is("deleted_at", null);
const { data: screeners } = await sb.from("screener_responses").select("lead_id,answers,analytics,completion_status,submitted_at,started_at,deleted_at").is("deleted_at", null);
const { data: ftvRows } = await sb.from("ftv_responses").select("lead_id,payload,status").is("deleted_at", null);
const { data: payouts } = await sb.from("payouts").select("lead_id,payment_status,amount");
const { data: formSettings } = await sb.from("form_settings").select("study_config").eq("form_type","registration").maybeSingle();

const scBy = new Map((screeners??[]).map(r=>[r.lead_id,r]));
const ftvBy = new Map((ftvRows??[]).map(r=>[r.lead_id,r]));
const paid = new Set((payouts??[]).filter(p=>p.payment_status==="paid").map(p=>p.lead_id));

const cfg = formSettings?.study_config ?? { target: 150, buffer: 30 };
const cap = (cfg.target??150) + (cfg.buffer??30);

const completed = (participants??[]).filter(p => (p.status??"").toLowerCase()==="completed");

const rows = completed.map(p => {
  const sc = scBy.get(p.lead_id);
  const ftv = ftvBy.get(p.lead_id);
  const emptyAns = isAnswersEmpty(sc?.answers);
  const ftvCount = payloadAnswerCount(ftv?.payload);
  const analyticsCount = payloadAnswerCount(sc?.analytics);
  const surveyItems = Math.max(ftvCount, analyticsCount);
  const hollow = emptyAns && surveyItems === 0;
  const hasDemo = Boolean(p.full_name?.trim() && p.full_name !== "Anonymous" && p.mobile?.trim());
  return { ...p, emptyAns, surveyItems, hollow, hasDemo, submitted_at: sc?.submitted_at, paid: paid.has(p.lead_id) };
});

const hollow = rows.filter(r => r.hollow);
const real = rows.filter(r => !r.hollow);
const realClean = real.filter(r => r.duplicate_flag !== true);
const deliverableToday = (participants??[]).filter(p => {
  if (!QUALIFIED.includes((p.status??"").toLowerCase())) return false;
  if (p.duplicate_flag === true) return false;
  const s = (p.status??"").toLowerCase();
  if (s === "review_fail" || s === "unsuccessful") return false;
  return true;
});

// QC pass auto (fingerprint only for now - migration 026 may not be applied)
const qcPassRealClean = realClean.filter(p => {
  const o = p.qc_status_override;
  if (o === "fail") return false;
  if (o === "pass" || o === "review") return o === "pass";
  return true; // auto pass if not fingerprint
});

console.log("=== VERBATIM SQL EQUIVALENTS ===");
console.log(`SELECT COUNT(*) FROM participants WHERE status='completed' AND deleted_at IS NULL;`);
console.log(`=> ${completed.length}`);
console.log(`\nSELECT COUNT(*) FROM screener_responses sr JOIN participants p ON p.lead_id=sr.lead_id WHERE p.status='completed' AND (sr.answers IS NULL OR sr.answers::text IN ('{}','null',''));`);
console.log(`=> ${rows.filter(r=>r.emptyAns).length}`);
console.log(`\nHollow (empty answers AND zero survey payload items): ${hollow.length}`);

console.log("\n=== HEADLINE ===");
console.log(JSON.stringify({
  cap,
  form_closes_in: cap - completed.length,
  completes_status_completed: completed.length,
  hollow_to_exclude: hollow.length,
  real_completes: real.length,
  real_clean_not_fingerprint: realClean.length,
  deliverable_clean_current_logic: deliverableToday.length,
  deliverable_excluding_hollow: deliverableToday.filter(p => !hollow.some(h => h.lead_id === p.lead_id)).length,
  hollow_already_paid: hollow.filter(r=>r.paid).length,
  cap_counts_raw_completed: true,
  clean_needed_for_cap_if_cap_used_clean: Math.max(0, cap - realClean.length),
  projected_shortfall_if_cap_stays_raw: Math.max(0, cap - realClean.length),
}, null, 2));

console.log("\n=== DISTRIBUTION surveyItems (completed only) ===");
const dist = {};
for (const r of rows) dist[r.surveyItems] = (dist[r.surveyItems]??0)+1;
console.log(dist);

console.log("\n=== ALL 20 HOLLOW lead_ids ===");
console.log(hollow.map(r => r.lead_id).join(", "));

console.log("\n=== HOLLOW timestamps (submitted_at) ===");
const ts = {};
for (const r of hollow) {
  const b = r.submitted_at?.slice(0,16) ?? "?";
  ts[b] = (ts[b]??0)+1;
}
console.log(ts);

console.log("\n=== 10 HOLLOW RECORDS DETAIL ===");
console.log(JSON.stringify(hollow.slice(0,10).map(r=>({
  lead_id: r.lead_id,
  submitted_at: r.submitted_at,
  surveyItems: r.surveyItems,
  hasDemo: r.hasDemo,
  duplicate_flag: r.duplicate_flag,
  paid: r.paid,
})), null, 2));

console.log("\n=== 5 BOUNDARY (surveyItems 40-42, if any) ===");
console.log(JSON.stringify(rows.filter(r=>r.surveyItems>=40 && r.surveyItems<=42).slice(0,5), null, 2));

console.log("\n=== 5 JUST OUTSIDE (lowest non-hollow surveyItems) ===");
const nonHollow = rows.filter(r=>!r.hollow).sort((a,b)=>a.surveyItems-b.surveyItems);
console.log(JSON.stringify(nonHollow.slice(0,5).map(r=>({lead_id:r.lead_id,surveyItems:r.surveyItems,emptyAns:r.emptyAns})), null, 2));

const screenerCompleted = (screeners??[]).filter(r=>r.completion_status==="Completed" && !r.deleted_at);
const screenerCompletedEmpty = screenerCompleted.filter(r=>isAnswersEmpty(r.answers));
console.log("\n=== CAP RPC (screener_responses) ===");
console.log(`count_qualified_completions equivalent: ${screenerCompleted.length}`);
console.log(`Completed screener with empty answers: ${screenerCompletedEmpty.length}`);
