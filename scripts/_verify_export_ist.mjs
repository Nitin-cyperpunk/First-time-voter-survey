/**
 * Verify IST export timestamps against live FTV rows. Writes tmp/ftv-ist-verify.xlsx
 * node --import tsx scripts/_verify_export_ist.mjs
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

import { stampExportDateCells } from "@/lib/export";
import { formatExportDateTime } from "@/lib/format-admin-datetime";
import { pivotFtvWideRow } from "@/lib/ftv-export/pivot";
import { FTV_EXPORT_HEADERS } from "@/lib/ftv-export/catalog";

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

const ids = ["CI_FTV_0348", "CI_FTV_0346", "CI_FTV_0155"];
const { data, error } = await sb
  .from("ftv_responses")
  .select(
    "respondent_id, started_at, completed_at, terminated_at, created_at, status",
  )
  .in("respondent_id", ids);
if (error) throw error;

const rows = (data ?? []).map((r) =>
  pivotFtvWideRow(
    {
      respondent_id: r.respondent_id,
      status: r.status,
      started_at: r.started_at,
      completed_at: r.completed_at,
      terminated_at: r.terminated_at,
      created_at: r.created_at,
    },
    [],
  ),
);

const headers = [...FTV_EXPORT_HEADERS];
const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
stampExportDateCells(worksheet, headers);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Responses");
const out = path.join("tmp", "ftv-ist-verify.xlsx");
fs.mkdirSync("tmp", { recursive: true });
XLSX.writeFile(workbook, out);

const startedIdx = headers.indexOf("started_at (IST)");
const completedIdx = headers.indexOf("completed_at (IST)");
const createdIdx = headers.indexOf("created_at (IST)");
const terminatedIdx = headers.indexOf("terminated_at (IST)");

const report = (data ?? []).map((r, i) => {
  const completedCell =
    worksheet[XLSX.utils.encode_cell({ r: i + 1, c: completedIdx })];
  return {
    respondent_id: r.respondent_id,
    stored_completed_at: r.completed_at,
    admin_ui: new Date(r.completed_at).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    export_string: formatExportDateTime(r.completed_at),
    excel_cell_type: completedCell?.t,
    excel_number_format: completedCell?.z,
    started_at_ist: formatExportDateTime(r.started_at),
    created_at_ist: formatExportDateTime(r.created_at),
    terminated_at_ist: formatExportDateTime(r.terminated_at),
  };
});

console.log(
  JSON.stringify(
    {
      file: out,
      date_col_indexes: { startedIdx, completedIdx, createdIdx, terminatedIdx },
      records: report,
    },
    null,
    2,
  ),
);
