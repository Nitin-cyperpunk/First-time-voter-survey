/**
 * Phase 1.3 — live referral counts and pending conditions.
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
        l.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
      ];
    }),
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: cols, error: colErr } = await sb.rpc("exec_sql");
console.log("rpc skip", colErr?.message ?? "no exec_sql");

const { data: referrals, error } = await sb
  .from("referrals")
  .select(
    "id, referrer_lead_id, referred_lead_id, referral_code, reward_status, reward_amount, earned_at, paid_at, created_at",
  )
  .order("created_at", { ascending: true });

if (error) {
  console.error("referrals error", error);
  process.exit(1);
}

const rows = referrals ?? [];
const byStatus = {};
for (const row of rows) {
  const s = row.reward_status ?? "null";
  byStatus[s] = (byStatus[s] ?? 0) + 1;
}

const pending = rows.filter((row) => row.reward_status === "pending");
const leadIds = [
  ...new Set(
    pending.map((row) => row.referred_lead_id).filter(Boolean),
  ),
];

const { data: participants } = await sb
  .from("participants")
  .select("lead_id, full_name, mobile, status")
  .in("lead_id", leadIds.length ? leadIds : ["__none__"]);

const { data: screeners } = await sb
  .from("screener_responses")
  .select("lead_id, completion_status, termination_reason")
  .in("lead_id", leadIds.length ? leadIds : ["__none__"]);

const pMap = new Map((participants ?? []).map((p) => [p.lead_id, p]));
const sMap = new Map((screeners ?? []).map((s) => [s.lead_id, s]));

const pendingBreakdown = {};
const pendingSamples = [];
for (const row of pending) {
  const p = pMap.get(row.referred_lead_id);
  const s = sMap.get(row.referred_lead_id);
  const key = [
    p ? `status=${p.status}` : "referred_missing",
    s?.completion_status ? `screener=${s.completion_status}` : "no_screener",
    s?.termination_reason ? `term=${s.termination_reason}` : "no_term_reason",
    row.reward_amount == null ? "amount=null" : `amount=${row.reward_amount}`,
  ].join(" | ");
  pendingBreakdown[key] = (pendingBreakdown[key] ?? 0) + 1;
  if (pendingSamples.length < 8) {
    pendingSamples.push({
      id: row.id,
      created_at: row.created_at,
      referrer: row.referrer_lead_id,
      referred: row.referred_lead_id,
      referred_name: p?.full_name ?? null,
      referred_mobile: p?.mobile ?? null,
      referred_status: p?.status ?? null,
      screener: s?.completion_status ?? null,
      term: s?.termination_reason ?? null,
      amount: row.reward_amount,
    });
  }
}

const oldest = pending[0]?.created_at ?? null;
const newest = pending[pending.length - 1]?.created_at ?? null;

const { data: referrers } = await sb
  .from("participants")
  .select("lead_id, full_name, mobile")
  .in(
    "lead_id",
    [...new Set(rows.map((r) => r.referrer_lead_id).filter(Boolean))],
  );

const anon = (referrers ?? []).filter(
  (r) =>
    !r.full_name ||
    r.full_name === "Anonymous" ||
    !r.mobile,
);

const amounts = {
  pendingNull: pending.filter((r) => r.reward_amount == null).length,
  pendingZero: pending.filter((r) => Number(r.reward_amount) === 0).length,
  pendingOther: pending.filter(
    (r) => r.reward_amount != null && Number(r.reward_amount) !== 0,
  ).length,
  earnedAmounts: rows
    .filter((r) => r.reward_status === "earned")
    .slice(0, 5)
    .map((r) => r.reward_amount),
};

console.log(JSON.stringify({
  total: rows.length,
  byStatus,
  pendingCount: pending.length,
  oldestPending: oldest,
  newestPending: newest,
  pendingBreakdown,
  pendingSamples,
  anonymousOrNoMobileReferrers: anon,
  amounts,
}, null, 2));
