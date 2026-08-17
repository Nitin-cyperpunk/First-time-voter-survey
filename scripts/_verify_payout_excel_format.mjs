/**
 * Build a real payout xlsx and inspect XML + Excel COM visibility.
 * Usage: npx tsx --env-file=.env scripts/_verify_payout_excel_format.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";

import {
  PAYOUT_COLUMN_WIDTHS,
  buildRazorpayPayoutExcelBytes,
} from "../src/lib/export.ts";
import { buildPayoutExportRows } from "../src/lib/payout-export/razorpay-upi-format.ts";
import { listPayouts } from "../src/server/repositories/payouts.repository.ts";

const listed = await listPayouts({
  mode: "survey",
  duplicateFilter: "all",
  sortBy: "leadId",
  sortDir: "desc",
  page: 1,
  pageSize: 10000,
});

const { rows } = buildPayoutExportRows(
  listed.rows.map((row) => ({
    leadId: row.leadId,
    fullName: row.fullName,
    mobile: row.mobile,
    email: row.email,
    upiId: row.upiId,
    amount: row.surveyEarnings || 50,
    surveyName: row.surveyName,
    referralsName: row.referralsName,
  })),
);

const bytes = buildRazorpayPayoutExcelBytes({
  payoutRows: rows,
  filterMeta: {
    payoutType: "Survey",
    duplicateStatus: "All",
    rowCount: rows.length,
    note: "Format verification file.",
  },
});

const outPath = path.join(process.cwd(), "tmp", "payout-format-check.xlsx");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bytes);

const unzipped = unzipSync(bytes);
const sheetXml = strFromU8(unzipped["xl/worksheets/sheet1.xml"]);
const vml = strFromU8(unzipped["xl/drawings/vmlDrawing1.vml"]);
const comments = strFromU8(unzipped["xl/comments1.xml"]);
const workbook = strFromU8(unzipped["xl/workbook.xml"]);

const cols = [...sheetXml.matchAll(/<col min="(\d+)" max="\d+" width="([^"]+)"/g)].map(
  (match) => ({ col: Number(match[1]), width: match[2] }),
);

console.log("=== XML checks ===");
console.log({
  sheetNamePayouts: workbook.includes("<name>Payouts</name>"),
  instructionsSheet: workbook.includes("Instructions"),
  visibleFlagPresent: vml.includes("<x:Visible/>"),
  visibilityHidden: (vml.match(/visibility:hidden/g) ?? []).length,
  commentBoxWidth: (vml.match(/width:140pt/g) ?? []).length,
  freeze: sheetXml.includes('state="frozen"') && sheetXml.includes('ySplit="1"'),
  autoFilter: sheetXml.includes("<autoFilter"),
  dataValidations: sheetXml.includes("<dataValidations"),
  promptOnSelect: sheetXml.includes('showInputMessage="1"'),
  commentRefs: [...comments.matchAll(/comment ref="([A-Z]+1)"/g)].map((m) => m[1]),
  colWidthsXml: cols,
  configuredWch: [...PAYOUT_COLUMN_WIDTHS],
  rowCount: rows.length,
  outPath,
});

const orderOk =
  sheetXml.indexOf("</sheetData>") < sheetXml.indexOf("<autoFilter") &&
  sheetXml.indexOf("<autoFilter") < sheetXml.indexOf("<dataValidations") &&
  sheetXml.indexOf("<dataValidations") < sheetXml.indexOf("<legacyDrawing");
console.log("xml element order ok", orderOk);
console.log("written", outPath);
