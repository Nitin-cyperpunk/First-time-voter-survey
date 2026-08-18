import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";

import { stampExportDateCells } from "@/lib/export";
import {
  formatExportDateTime,
  toIstExcelDate,
} from "@/lib/format-admin-datetime";

test("formatExportDateTime converts UTC timestamptz to IST wall clock", () => {
  assert.equal(
    formatExportDateTime("2026-08-18T10:09:15.904+00:00"),
    "2026-08-18 15:39:15",
  );
  assert.equal(formatExportDateTime(null), "");
  assert.equal(formatExportDateTime(""), "");
});

test("formatExportDateTime shifts the calendar date across midnight IST", () => {
  // 14 Aug 18:31 UTC = 15 Aug 00:01 IST
  assert.equal(
    formatExportDateTime("2026-08-14T18:31:36.932+00:00"),
    "2026-08-15 00:01:36",
  );
});

test("toIstExcelDate does not re-convert an already-IST wall-clock string", () => {
  const date = toIstExcelDate("2026-08-18 15:39:15");
  assert.ok(date instanceof Date);
  assert.equal(date.toISOString(), "2026-08-18T15:39:15.000Z");
});

test("Excel date cells are numeric with IST wall-clock serial", () => {
  const headers = ["completed_at (IST)"];
  const worksheet = XLSX.utils.json_to_sheet(
    [{ "completed_at (IST)": "2026-08-18 15:39:15" }],
    { header: headers },
  );
  stampExportDateCells(worksheet, headers);
  const stamped = worksheet[XLSX.utils.encode_cell({ r: 1, c: 0 })];
  assert.equal(stamped.t, "n");
  assert.equal(stamped.z, "yyyy-mm-dd hh:mm:ss");
  const excelDate = toIstExcelDate("2026-08-18 15:39:15") as Date;
  const expected = (excelDate.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  assert.ok(Math.abs(Number(stamped.v) - expected) < 1e-8);
});
