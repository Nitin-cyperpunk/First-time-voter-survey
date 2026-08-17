/**
 * Verify payout duplicate filter counts + Excel XML order.
 * Usage: npx tsx --env-file=.env scripts/_verify_payout_duplicate_filter.mjs
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { insertDataValidationsXml } from "../src/lib/export.ts";
import {
  RAZORPAY_UPI_HEADERS,
  PAYOUT_READINESS_HEADER,
  buildPayoutExportRows,
} from "../src/lib/payout-export/razorpay-upi-format.ts";
import { listPayouts } from "../src/server/repositories/payouts.repository.ts";

const require = createRequire(import.meta.url);
const XLSXStyle = require("xlsx-js-style");

async function countsFor(mode, duplicateFilter) {
  const result = await listPayouts({
    mode,
    duplicateFilter,
    sortBy: "leadId",
    sortDir: "desc",
    page: 1,
    pageSize: 10000,
  });
  return {
    mode,
    duplicateFilter,
    rowCount: result.rows.length,
    total: result.total,
    counts: result.counts,
    sample: result.rows.slice(0, 3).map((row) => ({
      leadId: row.leadId,
      isFlaggedDuplicate: row.isFlaggedDuplicate,
      duplicateFlag: row.duplicateFlag,
      originalParticipantLeadId: row.originalParticipantLeadId,
    })),
    rows: result.rows,
  };
}

const referralAll = await countsFor("referral", "all");
const referralFlagged = await countsFor("referral", "flagged");
const referralClean = await countsFor("referral", "clean");
const surveyAll = await countsFor("survey", "all");
const surveyFlagged = await countsFor("survey", "flagged");
const surveyClean = await countsFor("survey", "clean");

console.log("=== Referral ===");
console.log(JSON.stringify({
  all: referralAll.total,
  flagged: referralFlagged.total,
  clean: referralClean.total,
  sum: referralFlagged.total + referralClean.total,
  countsFromAll: referralAll.counts,
}, null, 2));
console.log("flagged sample", referralFlagged.sample);
console.log("clean sample", referralClean.sample);

console.log("=== Survey ===");
console.log(JSON.stringify({
  all: surveyAll.total,
  flagged: surveyFlagged.total,
  clean: surveyClean.total,
  sum: surveyFlagged.total + surveyClean.total,
  countsFromAll: surveyAll.counts,
}, null, 2));

const searchHit = await listPayouts({
  mode: "referral",
  duplicateFilter: "flagged",
  search: referralFlagged.sample[0]?.leadId ?? "CI_FTV",
  sortBy: "leadId",
  sortDir: "desc",
  page: 1,
  pageSize: 10000,
});
console.log("=== Search composed with Flagged ===");
console.log({
  search: referralFlagged.sample[0]?.leadId,
  total: searchHit.total,
  ids: searchHit.rows.map((row) => row.leadId),
});

const { rows: payoutRows } = buildPayoutExportRows(
  surveyAll.rows.map((row) => ({
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

const headers = [...RAZORPAY_UPI_HEADERS, PAYOUT_READINESS_HEADER];
const sheet = XLSXStyle.utils.json_to_sheet(payoutRows, { header: headers });
for (let i = 0; i < 9; i += 1) {
  const address = XLSXStyle.utils.encode_cell({ r: 0, c: i });
  const cell = sheet[address] ?? { t: "s", v: headers[i] };
  cell.c = [{ a: "RazorpayX", t: "prompt" }];
  sheet[address] = cell;
}
const wb = XLSXStyle.utils.book_new();
XLSXStyle.utils.book_append_sheet(wb, sheet, "Payouts");
const filterRows = [
  { Field: "Payout type", Value: "Survey" },
  { Field: "Duplicate status", Value: "All" },
  { Field: "Rows in this file", Value: payoutRows.length },
];
XLSXStyle.utils.book_append_sheet(
  wb,
  XLSXStyle.utils.json_to_sheet(filterRows, { header: ["Field", "Value"] }),
  "Export filter",
);
const raw = XLSXStyle.write(wb, { bookType: "xlsx", type: "array" });
const unzipped = unzipSync(new Uint8Array(raw));
const xml = strFromU8(unzipped["xl/worksheets/sheet1.xml"]);
const injected = insertDataValidationsXml(
  xml,
  '<dataValidations count="9"></dataValidations>',
);
unzipped["xl/worksheets/sheet1.xml"] = strToU8(injected);
const out = zipSync(unzipped, { level: 6 });
fs.mkdirSync("tmp", { recursive: true });
fs.writeFileSync("tmp/verify-payout-survey.xlsx", out);

const check = strFromU8(unzipped["xl/worksheets/sheet1.xml"]);
const order = {
  sheetData: check.indexOf("</sheetData>"),
  dataValidations: check.indexOf("<dataValidations"),
  ignoredErrors: check.indexOf("<ignoredErrors"),
  legacyDrawing: check.indexOf("<legacyDrawing"),
};
console.log("=== Excel XML order (must be sheetData < validations < drawing) ===");
console.log(order);
console.log(
  "valid order",
  order.dataValidations > order.sheetData &&
    (order.legacyDrawing === -1 || order.dataValidations < order.legacyDrawing),
);
console.log("survey export rows", payoutRows.length);
console.log("written tmp/verify-payout-survey.xlsx");
