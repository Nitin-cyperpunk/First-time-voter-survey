/**
 * Phase 0–1 audit: cap clock + flag split + 220→clean reconciliation.
 * Read-only. node scripts/_audit_clean_cap_phase1.mjs
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

const QUALIFIED = [
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
];

function matchType(p) {
  const ip = p.is_flagged_duplicate === true;
  const fp = p.duplicate_flag === true;
  if (ip && fp) return "both";
  if (ip) return "ip";
  if (fp) return "fingerprint";
  return "none";
}

function isQualified(status) {
  return QUALIFIED.includes((status ?? "").toLowerCase());
}

const { data: cfgRow } = await sb
  .from("form_settings")
  .select("study_config")
  .eq("form_type", "registration")
  .maybeSingle();
const cfg = cfgRow?.study_config ?? {};

const { data: participants, error: pErr } = await sb
  .from("participants")
  .select(
    "lead_id, status, duplicate_flag, is_flagged_duplicate, survey_data_incomplete, qc_status_override, duplicate_cluster_id, device_fingerprint, city, acquisition_source, acquisition_type, referral_platform, referred_by, created_at",
  )
  .is("deleted_at", null);
if (pErr) throw pErr;

const all = participants ?? [];
const now = Date.now();
const h6 = now - 6 * 3600_000;
const h24 = now - 24 * 3600_000;

const completedAll = all.filter((p) => isQualified(p.status));
const completedOnly = all.filter((p) => (p.status ?? "").toLowerCase() === "completed");
const terminated = all.filter((p) => (p.status ?? "").toLowerCase() === "terminated");
const other = all.filter(
  (p) => !isQualified(p.status) && (p.status ?? "").toLowerCase() !== "terminated",
);

const arrives = (since) =>
  completedAll.filter((p) => new Date(p.created_at).getTime() >= since).length;

const last6 = arrives(h6);
const last24 = arrives(h24);

function isClean(p) {
  if (!isQualified(p.status)) return false;
  if (p.duplicate_flag === true) return false;
  const s = (p.status ?? "").toLowerCase();
  if (s === "review_fail" || s === "unsuccessful") return false;
  if (p.survey_data_incomplete === true) return false;
  return true;
}

const clean = completedAll.filter(isClean);

const flaggedAny = all.filter(
  (p) => p.duplicate_flag === true || p.is_flagged_duplicate === true,
);
const flaggedCompleted = completedAll.filter(
  (p) => p.duplicate_flag === true || p.is_flagged_duplicate === true,
);

function bucket(rows) {
  const out = { fingerprint: 0, both: 0, ip: 0, none: 0 };
  for (const r of rows) out[matchType(r)] += 1;
  return out;
}

// 1.1 equivalent
const group = {};
for (const p of flaggedAny) {
  const k = `${matchType(p)}|${p.status}`;
  group[k] = (group[k] ?? 0) + 1;
}

const hollowCompleted = completedAll.filter((p) => p.survey_data_incomplete === true);
const hollowCleanWouldBe = hollowCompleted.filter(
  (p) => p.duplicate_flag !== true && (p.status ?? "").toLowerCase() !== "review_fail",
);
const fpCompleted = completedAll.filter((p) => p.duplicate_flag === true);
const ipOnlyCompleted = completedAll.filter(
  (p) => p.is_flagged_duplicate === true && p.duplicate_flag !== true,
);
const qcFailCompleted = completedAll.filter((p) => {
  const s = (p.status ?? "").toLowerCase();
  return s === "review_fail" || s === "unsuccessful";
});

// exclusive waterfall for 220 → clean
const waterfall = {
  qualified: completedAll.length,
  minus_fingerprint: 0,
  minus_hollow_not_fp: 0,
  minus_qc_fail_not_fp_not_hollow: 0,
  minus_ip_only: 0, // should be 0 if IP stays clean
  remaining_clean: 0,
};
const used = new Set();
for (const p of completedAll) {
  if (p.duplicate_flag === true) {
    waterfall.minus_fingerprint += 1;
    used.add(p.lead_id);
  }
}
for (const p of completedAll) {
  if (used.has(p.lead_id)) continue;
  if (p.survey_data_incomplete === true) {
    waterfall.minus_hollow_not_fp += 1;
    used.add(p.lead_id);
  }
}
for (const p of completedAll) {
  if (used.has(p.lead_id)) continue;
  const s = (p.status ?? "").toLowerCase();
  if (s === "review_fail" || s === "unsuccessful") {
    waterfall.minus_qc_fail_not_fp_not_hollow += 1;
    used.add(p.lead_id);
  }
}
for (const p of completedAll) {
  if (used.has(p.lead_id)) continue;
  if (p.is_flagged_duplicate === true && p.duplicate_flag !== true) {
    waterfall.minus_ip_only += 1;
  }
}
waterfall.remaining_clean = completedAll.length - used.size;

// QC auto on completed
function autoQc(p) {
  if (p.duplicate_flag === true) return "fail";
  if (p.survey_data_incomplete === true) return "review";
  if ((p.status ?? "").toLowerCase() === "terminated") return "review";
  if (p.is_flagged_duplicate === true && p.duplicate_flag !== true) return "review";
  return "pass";
}
function effectiveQc(p) {
  const o = p.qc_status_override;
  if (o === "pass" || o === "fail" || o === "review") return o;
  return autoQc(p);
}

const qcOnCompleted = { pass: 0, fail: 0, review: 0 };
for (const p of completedAll) qcOnCompleted[effectiveQc(p)] += 1;

const reviewCompletedNotFp = completedAll.filter(
  (p) => effectiveQc(p) === "review" && p.duplicate_flag !== true,
);

// clustering 1.5 among flagged
function topN(rows, key, n = 8) {
  const m = {};
  for (const r of rows) {
    const k = (r[key] || "(blank)").toString();
    m[k] = (m[k] ?? 0) + 1;
  }
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

const flaggedFp = all.filter((p) => p.duplicate_flag === true);
const clusterSizes = {};
for (const p of flaggedFp) {
  const id = p.duplicate_cluster_id || p.device_fingerprint || "(none)";
  clusterSizes[id] = (clusterSizes[id] ?? 0) + 1;
}
const clusterDist = {};
for (const n of Object.values(clusterSizes)) {
  clusterDist[n] = (clusterDist[n] ?? 0) + 1;
}
const largestClusters = Object.entries(clusterSizes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([id, n]) => ({ id: String(id).slice(0, 36), n }));

const cap = (cfg.target ?? 200) + (cfg.buffer ?? 30);
const remaining = Math.max(0, cap - completedAll.length);
const rate24 = last24 / 24;
const hoursToCap = rate24 > 0 ? remaining / rate24 : Infinity;

console.log(
  JSON.stringify(
    {
      phase0: {
        form_status: cfg.form_status,
        auto_close_on_full: cfg.auto_close_on_full,
        enforce_capacity: cfg.enforce_capacity,
        target: cfg.target,
        buffer: cfg.buffer,
        closesAt: cap,
        completed_qualified: completedAll.length,
        remaining_to_raw_cap: remaining,
        completes_last_6h: last6,
        completes_last_24h: last24,
        hours_to_10_at_24h_rate: hoursToCap,
        can_close_within_hours: hoursToCap <= 12,
      },
      counts: {
        registered: all.length,
        completed_qualified: completedAll.length,
        status_completed_only: completedOnly.length,
        terminated: terminated.length,
        other_status: other.length,
        other_breakdown: Object.fromEntries(
          Object.entries(
            other.reduce((acc, p) => {
              acc[p.status] = (acc[p.status] ?? 0) + 1;
              return acc;
            }, {}),
          ),
        ),
        paid: all.filter((p) => (p.status ?? "").toLowerCase() === "paid").length,
        clean_deliverable: clean.length,
        fraud_flagged_any: flaggedAny.length,
        fraud_flagged_fp_or_legacy: Math.max(
          all.filter((p) => p.duplicate_flag === true).length,
          all.filter((p) => p.is_flagged_duplicate === true).length,
        ),
        fraud_kpi_max_of_fp_and_ip: Math.max(
          all.filter((p) => p.duplicate_flag === true).length,
          all.filter((p) => p.is_flagged_duplicate === true).length,
        ),
      },
      phase1_1_flagged_by_type_status: Object.entries(group)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => {
          const [type, status] = k.split("|");
          return { duplicate_match_type: type, status, count: n };
        }),
      phase1_2_split: {
        all_records: bucket(all),
        flagged_any: bucket(flaggedAny),
        flagged_completed: bucket(flaggedCompleted),
        completed_all: bucket(completedAll),
      },
      phase1_3: {
        ip_only_in_clean: clean.filter(
          (p) => p.is_flagged_duplicate === true && p.duplicate_flag !== true,
        ).length,
        ip_only_completed_total: ipOnlyCompleted.length,
        ip_only_excluded_from_clean: ipOnlyCompleted.filter((p) => !isClean(p)).length,
      },
      phase1_4_waterfall: {
        ...waterfall,
        check_sum:
          waterfall.minus_fingerprint +
          waterfall.minus_hollow_not_fp +
          waterfall.minus_qc_fail_not_fp_not_hollow +
          waterfall.remaining_clean,
        hollow_completed_total: hollowCompleted.length,
        hollow_also_fingerprint: hollowCompleted.filter((p) => p.duplicate_flag === true)
          .length,
        fp_completed: fpCompleted.length,
        ip_only_completed: ipOnlyCompleted.length,
        qc_fail_completed: qcFailCompleted.length,
      },
      phase1_5_flagged_clusters: {
        by_acquisition_source: topN(flaggedAny, "acquisition_source"),
        by_acquisition_type: topN(flaggedAny, "acquisition_type"),
        by_referral_platform: topN(flaggedAny, "referral_platform"),
        by_referred_by: topN(flaggedAny, "referred_by"),
        by_city: topN(flaggedAny, "city"),
        flagged_fp_by_source: topN(flaggedFp, "acquisition_source"),
        all_by_source: topN(all, "acquisition_source"),
      },
      phase1_6_qc: {
        qc_on_completed: qcOnCompleted,
        review_completed_not_fingerprint: reviewCompletedNotFp.length,
        review_breakdown: {
          hollow: reviewCompletedNotFp.filter((p) => p.survey_data_incomplete === true)
            .length,
          ip_only: reviewCompletedNotFp.filter(
            (p) =>
              p.survey_data_incomplete !== true &&
              p.is_flagged_duplicate === true &&
              p.duplicate_flag !== true,
          ).length,
          other: reviewCompletedNotFp.filter(
            (p) =>
              p.survey_data_incomplete !== true &&
              !(p.is_flagged_duplicate === true && p.duplicate_flag !== true),
          ).length,
        },
      },
      phase1_7_fingerprint_clusters: {
        flagged_fingerprint_rows: flaggedFp.length,
        distinct_clusters: Object.keys(clusterSizes).length,
        size_distribution_how_many_clusters_of_size: clusterDist,
        largest: largestClusters,
      },
      registered_balance: {
        registered: all.length,
        completed_plus_terminated: completedAll.length + terminated.length,
        leftover: all.length - completedAll.length - terminated.length,
      },
    },
    null,
    2,
  ),
);
