/**
 * One-off Phase 7 helper: live filter cases + open generated export files.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

import { pendingRewardReason } from "../src/lib/referrals/pending-reward-reason";
import {
  REFERRAL_EXPORT_HEADERS,
  rowsToReferralExport,
} from "../src/lib/referrals/referral-export";
import {
  PARTICIPANT_LIST_EXPORT_HEADERS,
  rowsToParticipantExport,
} from "../src/lib/bulk-selection/participant-export";

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

function matchesReferrerSearch(
  row: { referrerName: string; referrerMobile: string; referrerLeadId: string | null },
  search: string,
) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const displayName = (row.referrerName.trim() || "Anonymous").toLowerCase();
  const mobile = row.referrerMobile.toLowerCase();
  const leadId = (row.referrerLeadId ?? "").toLowerCase();
  return (
    displayName.includes(needle) ||
    mobile.includes(needle) ||
    leadId.includes(needle)
  );
}

void main();

async function main() {
const { data: referrals, error } = await sb
  .from("referrals")
  .select(
    "id, referrer_lead_id, referred_lead_id, reward_status, reward_amount, created_at",
  )
  .order("created_at", { ascending: false });

if (error) {
  console.error(error);
  process.exit(1);
}

const rows = referrals ?? [];
const leadIds = [
  ...new Set(
    rows.flatMap((r) => [r.referrer_lead_id, r.referred_lead_id]).filter(Boolean),
  ),
];

const { data: participants } = await sb
  .from("participants")
  .select("lead_id, full_name, mobile, status, city, created_at")
  .in("lead_id", leadIds.length ? leadIds : ["__none__"]);

const { data: allParticipants } = await sb
  .from("participants")
  .select(
    "lead_id, full_name, mobile, city, status, created_at, is_flagged_duplicate, duplicate_flag, original_participant_lead_id",
  )
  .is("deleted_at", null)
  .order("created_at", { ascending: false })
  .limit(200);

const { data: screeners } = await sb
  .from("screener_responses")
  .select("lead_id, termination_reason")
  .in(
    "lead_id",
    [...new Set(rows.map((r) => r.referred_lead_id).filter(Boolean))],
  );

const pMap = new Map((participants ?? []).map((p) => [p.lead_id, p]));
const tMap = new Map(
  (screeners ?? []).map((s) => [s.lead_id, s.termination_reason ?? null]),
);

const mapped = rows.map((row) => {
  const referrer = row.referrer_lead_id
    ? pMap.get(row.referrer_lead_id)
    : undefined;
  const referred = row.referred_lead_id
    ? pMap.get(row.referred_lead_id)
    : undefined;
  const referredFound = Boolean(row.referred_lead_id && referred);
  const parsedAmount =
    row.reward_amount == null ? null : Number(row.reward_amount);
  return {
    referrerLeadId: row.referrer_lead_id ?? null,
    referredLeadId: row.referred_lead_id ?? null,
    referrerName: referrer?.full_name ?? "",
    referrerMobile: referrer?.mobile ?? "",
    referredName: referred?.full_name ?? "",
    referredMobile: referred?.mobile ?? "",
    rewardStatus: row.reward_status,
    rewardAmount:
      parsedAmount != null && Number.isFinite(parsedAmount) ? parsedAmount : null,
    pendingReason: pendingRewardReason({
      rewardStatus: row.reward_status,
      referredFound,
      referredStatus: referred?.status ?? null,
      terminationReason: row.referred_lead_id
        ? (tMap.get(row.referred_lead_id) ?? null)
        : null,
    }),
    createdAt: row.created_at,
  };
});

const referrerIds = new Set(
  mapped.map((r) => r.referrerLeadId).filter(Boolean),
);
const referredOnly = mapped.filter(
  (r) => r.referredLeadId && !referrerIds.has(r.referredLeadId),
);

const anonymous = mapped.filter(
  (r) =>
    (r.referrerName.trim() === "" || r.referrerName === "Anonymous") &&
    !r.referrerMobile.trim(),
);

function applyFilter(needle: string) {
  return mapped.filter((row) => matchesReferrerSearch(row, needle));
}

const outDir = path.join("tmp", "referral-export-verify");
fs.mkdirSync(outDir, { recursive: true });

function writeWorkbook(
  filename: string,
  sheetName: string,
  exportRows: Record<string, string | number>[],
  headers: string[],
) {
  const filePath = path.join(outDir, filename);
  const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filePath);
  const opened = XLSX.readFile(filePath);
  const sheet = opened.Sheets[opened.SheetNames[0]!];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  return {
    filePath,
    sheetNames: opened.SheetNames,
    header: aoa[0],
    sample: aoa[1],
    rowCountExcludingHeader: Math.max(0, aoa.length - 1),
  };
}

const unfilteredExport = writeWorkbook(
  "referrals-all.xlsx",
  "Referrals",
  rowsToReferralExport(mapped),
  [...REFERRAL_EXPORT_HEADERS],
);
XLSX.writeFile(
  (() => {
    const ws = XLSX.utils.json_to_sheet(rowsToReferralExport(mapped), {
      header: [...REFERRAL_EXPORT_HEADERS],
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Referrals");
    return wb;
  })(),
  path.join(outDir, "referrals-all.csv"),
  { bookType: "csv" },
);

const filterNeedle = anonymous[0]?.referrerLeadId || mapped[0]?.referrerLeadId || "";
const filtered = applyFilter(filterNeedle);
const filteredExport = writeWorkbook(
  "referrals-filtered.xlsx",
  "Referrals",
  rowsToReferralExport(filtered),
  [...REFERRAL_EXPORT_HEADERS],
);

const respondentRows = (allParticipants ?? []).map((row) => ({
  leadId: row.lead_id,
  fullName: row.full_name ?? "",
  mobile: row.mobile ?? "",
  city: row.city,
  status: row.status,
  createdAt: row.created_at,
  isFlaggedDuplicate: Boolean(row.is_flagged_duplicate),
  duplicateFlag: Boolean(row.duplicate_flag),
  originalParticipantLeadId: row.original_participant_lead_id ?? null,
}));

const respondentsExport = writeWorkbook(
  "respondents-list.xlsx",
  "Respondents",
  rowsToParticipantExport(respondentRows),
  [...PARTICIPANT_LIST_EXPORT_HEADERS],
);

const mixedReferrer = [...referrerIds].find((id) => {
  const edges = mapped.filter((r) => r.referrerLeadId === id);
  const earned = edges.filter((r) => r.rewardStatus === "earned").length;
  const pending = edges.filter((r) => r.rewardStatus === "pending").length;
  return earned > 0 && pending > 0;
});

const mixedRows = mapped.filter((r) => r.referrerLeadId === mixedReferrer);
const mixedSummary = {
  total: mixedRows.length,
  earned: mixedRows.filter((r) => r.rewardStatus === "earned").length,
  pending: mixedRows.filter((r) => r.rewardStatus === "pending").length,
  earnedAmount: mixedRows
    .filter((r) => r.rewardStatus === "earned" || r.rewardStatus === "paid")
    .reduce((sum, r) => sum + (r.rewardAmount ?? 0), 0),
  pendingAmount: mixedRows
    .filter((r) => r.rewardStatus === "pending")
    .reduce((sum, r) => sum + (r.rewardAmount ?? 0), 0),
  pendingReasons: mixedRows
    .filter((r) => r.rewardStatus === "pending")
    .map((r) => ({
      referred: r.referredName || r.referredLeadId,
      reason: r.pendingReason,
    })),
};

console.log(
  JSON.stringify(
    {
      total: mapped.length,
      filterNeedle,
      unfilteredCount: mapped.length,
      filteredCount: filtered.length,
      filteredMatchesNeedleOnly: filtered.every((r) =>
        matchesReferrerSearch(r, filterNeedle),
      ),
      referredOnlySample: referredOnly.slice(0, 5).map((r) => ({
        referredLeadId: r.referredLeadId,
        referredName: r.referredName,
        referredMobile: r.referredMobile,
        appearsAsReferrer: false,
        filterByTheirName: applyFilter(r.referredName).length,
        filterByTheirMobile: r.referredMobile
          ? applyFilter(r.referredMobile).length
          : 0,
      })),
      anonymousReferrerRows: anonymous.slice(0, 3).map((r) => ({
        referrerLeadId: r.referrerLeadId,
        referrerName: r.referrerName,
        referrerMobile: r.referrerMobile,
        referredName: r.referredName,
        rewardStatus: r.rewardStatus,
        pendingReason: r.pendingReason,
      })),
      mixedReferrer,
      mixedSummary,
      unfilteredExport,
      filteredExport,
      respondentsExport,
    },
    null,
    2,
  ),
);
}
