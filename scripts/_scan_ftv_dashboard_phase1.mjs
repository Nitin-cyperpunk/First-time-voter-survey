/**
 * Phase 1 scan for FTV dashboard metrics reconciliation.
 * node scripts/_scan_ftv_dashboard_phase1.mjs
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
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const QUALIFIED = [
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
];
const QC_PASS = ["review_pass", "successful", "paid"];

const { data: rows, error } = await sb
  .from("participants")
  .select("lead_id, status, duplicate_flag, is_flagged_duplicate, review_status")
  .is("deleted_at", null);
if (error) throw error;
const all = rows ?? [];

const registered = all.length;
const completedRows = all.filter((r) =>
  QUALIFIED.includes((r.status ?? "").toLowerCase()),
);
const terminatedRows = all.filter(
  (r) => (r.status ?? "").toLowerCase() === "terminated",
);
const completed = completedRows.length;
const terminated = terminatedRows.length;
const paid = all.filter((r) => (r.status ?? "").toLowerCase() === "paid").length;
const fraudDupFlag = all.filter((r) => r.duplicate_flag === true).length;
const fraudLegacy = all.filter((r) => r.is_flagged_duplicate === true).length;
const fraudFlagged = Math.max(fraudDupFlag, fraudLegacy);

const statusBreakdown = {};
for (const r of all) {
  const s = (r.status ?? "unknown").toLowerCase();
  statusBreakdown[s] = (statusBreakdown[s] ?? 0) + 1;
}

const isAnyFlag = (r) =>
  r.duplicate_flag === true || r.is_flagged_duplicate === true;
const flaggedCompleted = completedRows.filter(isAnyFlag);
const flaggedTerminated = terminatedRows.filter(isAnyFlag);

const flaggedRows = all.filter(isAnyFlag);
const flaggedFpOnly = flaggedRows.filter(
  (r) => r.duplicate_flag === true && !r.is_flagged_duplicate,
).length;
const flaggedIpOnly = flaggedRows.filter(
  (r) => !r.duplicate_flag && r.is_flagged_duplicate === true,
).length;
const flaggedBoth = flaggedRows.filter(
  (r) => r.duplicate_flag === true && r.is_flagged_duplicate === true,
).length;

const fpCompleted = completedRows.filter((r) => r.duplicate_flag === true).length;
const fpTerminated = terminatedRows.filter((r) => r.duplicate_flag === true).length;
const ipOnlyCompleted = completedRows.filter(
  (r) => r.is_flagged_duplicate === true && !r.duplicate_flag,
).length;
const ipOnlyTerminated = terminatedRows.filter(
  (r) => r.is_flagged_duplicate === true && !r.duplicate_flag,
).length;

const cleanAll = all.filter((r) => !r.duplicate_flag).length;
const cleanCompleted = completedRows.filter((r) => !r.duplicate_flag).length;
const cleanQcPassed = completedRows.filter(
  (r) =>
    !r.duplicate_flag && QC_PASS.includes((r.status ?? "").toLowerCase()),
).length;

const { data: studyConfigRow } = await sb
  .from("form_settings")
  .select("study_config")
  .eq("form_type", "registration")
  .maybeSingle();
const config = studyConfigRow?.study_config ?? { target: 150, buffer: 30 };
const cap = (config.target ?? 150) + (config.buffer ?? 30);

console.log(
  JSON.stringify(
    {
      registered,
      completed,
      terminated,
      paid,
      fraudFlagged,
      fraudDupFlag,
      fraudLegacy,
      sumCompletedTerminated: completed + terminated,
      otherStatuses: registered - completed - terminated,
      statusBreakdown,
      overlap: {
        flaggedInCompleted: flaggedCompleted.length,
        flaggedInTerminated: flaggedTerminated.length,
        fpInCompleted: fpCompleted,
        fpInTerminated: fpTerminated,
        ipOnlyInCompleted: ipOnlyCompleted,
        ipOnlyInTerminated: ipOnlyTerminated,
      },
      fraudSplitAmongAnyFlag: {
        fingerprintOnly: flaggedFpOnly,
        ipOnly: flaggedIpOnly,
        both: flaggedBoth,
        totalAnyFlag: flaggedRows.length,
      },
      clean: {
        allParticipants_noFingerprint: cleanAll,
        amongCompleted_noFingerprint: cleanCompleted,
        amongCompleted_qcPassAndNoFingerprint: cleanQcPassed,
      },
      config: {
        target: config.target,
        buffer: config.buffer,
        closesAt: cap,
        form_status: config.form_status,
        auto_close_on_full: config.auto_close_on_full,
        enforce_capacity: config.enforce_capacity,
      },
      shortfallVsCap_cleanCompleted: Math.max(0, cap - cleanCompleted),
      projectedShortfallIfCapCountsCompleted: Math.max(
        0,
        cap - (completed - fpCompleted),
      ),
    },
    null,
    2,
  ),
);
