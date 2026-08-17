/**
 * Verifies respondent + payout export fixes against live Supabase data.
 * Usage: npx tsx --env-file=.env scripts/_verify_export_fixes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

import { FTV_EXPORT_HEADERS } from "../src/lib/ftv-export/catalog.ts";
import { buildPayoutExportRows } from "../src/lib/payout-export/razorpay-upi-format.ts";

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

const SURVEY_PAYOUT_STATUSES = new Set([
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
]);

function deriveMatchType(ip, fingerprint) {
  if (ip && fingerprint) return "Fingerprint + IP";
  if (ip) return "IP";
  if (fingerprint) return "Fingerprint";
  return "";
}

function duplicateExportFields(row) {
  const ip = Boolean(row.is_flagged_duplicate);
  const fp = Boolean(row.duplicate_flag);
  const any = ip || fp;
  return {
    duplicate_flag: any ? "Yes" : "",
    duplicate_match_type: deriveMatchType(ip, fp),
    duplicate_matched_lead_id: any
      ? (row.original_participant_lead_id?.trim() ?? "")
      : "",
  };
}

async function payoutEligibleCounts() {
  const { data, error } = await sb
    .from("participants")
    .select("lead_id, status, upi_id")
    .is("deleted_at", null);
  if (error) throw error;

  const surveyEligible = (data ?? []).filter((row) =>
    SURVEY_PAYOUT_STATUSES.has(String(row.status ?? "").toLowerCase()),
  );
  const referralEligible = data ?? [];
  const surveyMissingUpi = surveyEligible.filter(
    (row) => !row.upi_id?.trim(),
  ).length;
  const referralMissingUpi = referralEligible.filter(
    (row) => !row.upi_id?.trim(),
  ).length;

  return {
    surveyEligible: surveyEligible.length,
    surveyMissingUpi,
    referralEligible: referralEligible.length,
    referralMissingUpi,
    totalParticipants: (data ?? []).length,
  };
}

async function sampleRespondentExportRows() {
  const { data: participants, error } = await sb
    .from("participants")
    .select(
      "lead_id, full_name, mobile, city, status, created_at, is_flagged_duplicate, duplicate_flag, original_participant_lead_id",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const duplicate = (participants ?? []).find(
    (row) => row.is_flagged_duplicate || row.duplicate_flag,
  );
  const clean = (participants ?? []).find(
    (row) => !row.is_flagged_duplicate && !row.duplicate_flag,
  );
  const oldest = participants?.[0] ?? null;

  const pick = [
    { label: "duplicate", row: duplicate },
    { label: "clean", row: clean },
    { label: "oldest", row: oldest },
  ].filter((entry) => entry.row);

  const headers = [
    "Lead_ID",
    "Name",
    "Mobile",
    "City",
    "Status",
    "Registered",
    "duplicate_flag",
    "duplicate_match_type",
    "duplicate_matched_lead_id",
  ];

  const rows = pick.map(({ row }) => ({
    Lead_ID: row.lead_id,
    Name: row.full_name,
    Mobile: row.mobile,
    City: row.city ?? "",
    Status: row.status,
    Registered: row.created_at,
    ...duplicateExportFields(row),
  }));

  return { headers, rows, labels: pick.map((entry) => entry.label) };
}

async function samplePayoutExportRows() {
  const { data, error } = await sb
    .from("participants")
    .select("lead_id, full_name, mobile, email, upi_id, status")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const withUpi = (data ?? []).find((row) => row.upi_id?.trim());
  const withoutUpi = (data ?? []).find((row) => !row.upi_id?.trim());

  const source = [
    withUpi && {
      leadId: withUpi.lead_id,
      fullName: withUpi.full_name,
      mobile: withUpi.mobile,
      email: withUpi.email,
      upiId: withUpi.upi_id,
      amount: 50,
      surveyName: "FTV Survey",
      referralsName: "",
    },
    withoutUpi && {
      leadId: withoutUpi.lead_id,
      fullName: withoutUpi.full_name,
      mobile: withoutUpi.mobile,
      email: withoutUpi.email,
      upiId: withoutUpi.upi_id,
      amount: 50,
      surveyName: "FTV Survey",
      referralsName: "",
    },
    {
      leadId: "EDGE_ZERO_NAME",
      fullName: "!!!",
      mobile: "9876543210",
      email: null,
      upiId: null,
      amount: 50,
      surveyName: "FTV Survey",
      referralsName: "",
    },
  ].filter(Boolean);

  const { rows, summary } = buildPayoutExportRows(source);
  const headers = Object.keys(rows[0] ?? {});

  const outDir = path.join(process.cwd(), "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const xlsxPath = path.join(outDir, "verify-payout-export.xlsx");
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Payouts");
  XLSX.writeFile(wb, xlsxPath);

  const emptyUpiChecks = rows
    .map((row, index) => ({
      index,
      upi: row["Beneficiary's UPI ID (Mandatory)"],
      readiness: row["Payout readiness"],
    }))
    .filter((row) => row.readiness === "Missing UPI")
    .map((row) => ({
      row: row.index,
      upiIsEmptyString: row.upi === "",
      upiIsNull: row.upi == null,
      upiTrimmedLength: String(row.upi ?? "").trim().length,
    }));

  return { headers, rows, summary, xlsxPath, emptyUpiChecks };
}

console.log("=== 1.8 Payout-eligible counts ===");
console.log(JSON.stringify(await payoutEligibleCounts(), null, 2));

console.log("\n=== FTV export header tail ===");
console.log(
  JSON.stringify(
    {
      totalHeaders: FTV_EXPORT_HEADERS.length,
      tail: FTV_EXPORT_HEADERS.slice(-3),
      firstFive: FTV_EXPORT_HEADERS.slice(0, 5),
    },
    null,
    2,
  ),
);

console.log("\n=== Respondent export sample ===");
const respondent = await sampleRespondentExportRows();
console.log("headers:", respondent.headers.join(","));
for (const [i, row] of respondent.rows.entries()) {
  console.log(`row(${respondent.labels[i]}):`, JSON.stringify(row));
}

console.log("\n=== Payout export sample ===");
const payout = await samplePayoutExportRows();
console.log("headers:", payout.headers.join("|"));
console.log("summary:", payout.summary);
for (const row of payout.rows) {
  console.log("row:", JSON.stringify(row));
}
console.log("empty UPI cell checks:", payout.emptyUpiChecks);
console.log("written:", payout.xlsxPath);

const { data: allParticipants, error: allError } = await sb
  .from("participants")
  .select("lead_id, full_name, mobile, email, upi_id, status")
  .is("deleted_at", null);
if (allError) throw allError;

const surveySource = (allParticipants ?? [])
  .filter((row) =>
    SURVEY_PAYOUT_STATUSES.has(String(row.status ?? "").toLowerCase()),
  )
  .map((row) => ({
    leadId: row.lead_id,
    fullName: row.full_name,
    mobile: row.mobile,
    email: row.email,
    upiId: row.upi_id,
    amount: 50,
    surveyName: "FTV Survey",
    referralsName: "",
  }));

const surveyExport = buildPayoutExportRows(surveySource);
console.log("\n=== 4.6 Survey payout reconciliation ===");
console.log(
  JSON.stringify(
    {
      dbSurveyEligible: surveySource.length,
      exportRows: surveyExport.rows.length,
      summary: surveyExport.summary,
    },
    null,
    2,
  ),
);

const emptyExport = buildPayoutExportRows([]);
console.log("\n=== Empty payout export ===");
console.log(JSON.stringify(emptyExport, null, 2));

const readBack = XLSX.readFile(payout.xlsxPath);
const sheet = readBack.Sheets[readBack.SheetNames[0]];
const readRows = XLSX.utils.sheet_to_json(sheet);
console.log("\n=== Excel read-back row count ===", readRows.length);
