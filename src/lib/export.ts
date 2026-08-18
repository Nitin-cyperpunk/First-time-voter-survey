import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  EXPORT_DATETIME_NUMBER_FORMAT,
  isExportDateTimeHeader,
  toIstExcelDate,
} from "@/lib/format-admin-datetime";

import {
  RAZORPAY_UPI_COLUMN_VALIDATIONS,
  RAZORPAY_UPI_HEADERS,
  PAYOUT_READINESS_HEADER,
  REFERRAL_COUNT_HEADER,
  REFERRAL_TOTAL_COUNT_HEADER,
  type PayoutExportRow,
} from "@/lib/payout-export/razorpay-upi-format";

export type ExportRow = Record<string, string | number>;

export type PayoutExportFilterMeta = {
  payoutType: string;
  duplicateStatus: string;
  rowCount: number;
  note: string;
};

type WorksheetOptions = {
  headers?: string[];
  freezeHeader?: boolean;
  autoWidth?: boolean;
  wrapText?: boolean;
};

function resolveHeaders(rows: ExportRow[]): string[] {
  if (rows.length === 0) {
    return [];
  }

  return Object.keys(rows[0]!);
}

function autoColumnWidths(
  rows: ExportRow[],
  headers: string[],
): Array<{ wch: number }> {
  return headers.map((header) => {
    const maxLen = Math.max(
      header.length,
      ...rows.map((row) => String(row[header] ?? "").length),
    );
    // Datetime meta cols need extra width so Excel doesn't show ########
    const minWidth =
      isExportDateTimeHeader(header) ||
      header === "Started at" ||
      header === "Completed at"
        ? 22
        : 12;
    return { wch: Math.min(Math.max(maxLen + 2, minWidth), 48) };
  });
}

function applyIstExcelDateCells(
  worksheet: XLSX.WorkSheet,
  headers: string[],
) {
  const ref = worksheet["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let c = 0; c <= range.e.c; c += 1) {
    const header = headers[c];
    if (!header || !isExportDateTimeHeader(header)) continue;
    for (let r = 1; r <= range.e.r; r += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[address];
      if (!cell || cell.v == null || cell.v === "") continue;
      const excelDate = toIstExcelDate(
        cell.v instanceof Date ? cell.v : String(cell.v),
      );
      if (excelDate === "") continue;
      const serial =
        (excelDate.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
      cell.t = "n";
      cell.v = serial;
      cell.z = EXPORT_DATETIME_NUMBER_FORMAT;
      delete cell.w;
    }
  }
}

/** Excel-only: convert IST datetime strings into numeric date cells. */
export function stampExportDateCells(
  worksheet: XLSX.WorkSheet,
  headers: string[],
) {
  applyIstExcelDateCells(worksheet, headers);
}

function buildWorksheet(
  rows: ExportRow[],
  options: WorksheetOptions & { excelDates?: boolean } = {},
): XLSX.WorkSheet {
  const headers = options.headers ?? resolveHeaders(rows);
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  if (options.excelDates) {
    applyIstExcelDateCells(worksheet, headers);
  }

  if (options.autoWidth !== false) {
    worksheet["!cols"] = autoColumnWidths(rows, headers);
  }

  if (options.freezeHeader !== false) {
    worksheet["!freeze"] = {
      xSplit: 0,
      ySplit: 1,
      topLeftCell: "A2",
      activePane: "bottomLeft",
      state: "frozen",
    };
  }

  return worksheet;
}

function applyFormattedHeaderStyles(
  worksheet: XLSX.WorkSheet,
  headers: string[],
  wrapText: boolean,
) {
  for (let index = 0; index < headers.length; index += 1) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
    const cell = worksheet[cellAddress];
    if (!cell) {
      continue;
    }

    cell.s = {
      font: { bold: true },
      alignment: {
        vertical: "top",
        wrapText,
      },
    };
  }
}

function triggerDownload(filename: string, data: Uint8Array, mime: string) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const blob = new Blob([copy.buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(
  filename: string,
  rows: ExportRow[],
  headers?: string[],
) {
  const cols = headers ?? resolveHeaders(rows);
  const worksheet =
    rows.length > 0
      ? buildWorksheet(rows, { headers: cols })
      : XLSX.utils.aoa_to_sheet([cols]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, filename, { bookType: "csv" });
}

export function downloadExcel(
  filename: string,
  sheetName: string,
  rows: ExportRow[],
  headers?: string[],
) {
  const cols = headers ?? resolveHeaders(rows);
  const worksheet =
    rows.length > 0
      ? buildWorksheet(rows, { headers: cols, excelDates: true })
      : XLSX.utils.aoa_to_sheet([cols]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

export function downloadExcelWorkbook(
  filename: string,
  sheets: Array<{ name: string; rows: ExportRow[]; headers?: string[] }>,
) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const cols = sheet.headers ?? resolveHeaders(sheet.rows);
    const worksheet =
      sheet.rows.length > 0
        ? buildWorksheet(sheet.rows, { headers: cols, excelDates: true })
        : XLSX.utils.aoa_to_sheet([cols.length ? cols : [""]]);
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      sheet.name.slice(0, 31),
    );
  }
  XLSX.writeFile(workbook, filename);
}

export function downloadFormattedExcel(
  filename: string,
  sheetName: string,
  rows: ExportRow[],
) {
  const headers = resolveHeaders(rows);
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  applyIstExcelDateCells(worksheet, headers);
  applyFormattedHeaderStyles(worksheet, headers, true);
  worksheet["!cols"] = autoColumnWidths(rows, headers);
  worksheet["!freeze"] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: "A2",
    activePane: "bottomLeft",
    state: "frozen",
  };

  const workbook = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSXStyle.writeFile(workbook, filename);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildDataValidationsXml(endRow: number): string {
  const last = Math.max(endRow, 2);
  const items = RAZORPAY_UPI_COLUMN_VALIDATIONS.map((rule) => {
    const sqref = `${rule.col}2:${rule.col}${last}`;
    const attrs = [
      `type="${rule.type}"`,
      rule.operator ? `operator="${rule.operator}"` : "",
      `allowBlank="${rule.allowBlank ? "1" : "0"}"`,
      'showInputMessage="1"',
      'showErrorMessage="1"',
      `promptTitle="${escapeXml(rule.promptTitle)}"`,
      `prompt="${escapeXml(rule.prompt)}"`,
      `errorTitle="${escapeXml(rule.errorTitle)}"`,
      `error="${escapeXml(rule.error)}"`,
      'errorStyle="stop"',
      `sqref="${sqref}"`,
    ]
      .filter(Boolean)
      .join(" ");

    const formulas: string[] = [];
    if (rule.formula1) {
      formulas.push(`<formula1>${escapeXml(rule.formula1)}</formula1>`);
    }
    if (rule.formula2) {
      formulas.push(`<formula2>${escapeXml(rule.formula2)}</formula2>`);
    }

    return `<dataValidation ${attrs}>${formulas.join("")}</dataValidation>`;
  });

  return `<dataValidations count="${items.length}">${items.join("")}</dataValidations>`;
}

/**
 * OOXML requires dataValidations immediately after sheetData — before
 * ignoredErrors and legacyDrawing. Inserting before </worksheet> makes Excel
 * repair the file when comments (legacyDrawing) are present.
 */
export function insertDataValidationsXml(
  sheetXml: string,
  validationsXml: string,
): string {
  if (sheetXml.includes("<dataValidations")) {
    return sheetXml.replace(
      /<dataValidations[\s\S]*?<\/dataValidations>/,
      validationsXml,
    );
  }
  if (sheetXml.includes("</sheetData>")) {
    return sheetXml.replace("</sheetData>", `</sheetData>${validationsXml}`);
  }
  if (sheetXml.includes("</worksheet>")) {
    return sheetXml.replace("</worksheet>", `${validationsXml}</worksheet>`);
  }
  return sheetXml;
}

/** Character widths: Name and UPI need more room than Amount. */
export const PAYOUT_COLUMN_WIDTHS = [
  28, // A Beneficiary Name
  34, // B UPI ID
  16, // C Payout Amount
  26, // D Narration
  24, // E Notes
  18, // F Phone
  30, // G Email
  22, // H Contact Reference ID
  22, // I Payout Reference ID
  20, // J Payout readiness
] as const;

function payoutHeaders(rows: PayoutExportRow[]): string[] {
  const headers: string[] = [...RAZORPAY_UPI_HEADERS, PAYOUT_READINESS_HEADER];
  if (rows.some((row) => REFERRAL_COUNT_HEADER in row)) {
    headers.push(REFERRAL_COUNT_HEADER);
  }
  if (rows.some((row) => REFERRAL_TOTAL_COUNT_HEADER in row)) {
    headers.push(REFERRAL_TOTAL_COUNT_HEADER);
  }
  return headers;
}

/**
 * xlsx-js-style emits <x:Visible/> which Excel treats as "always show this note".
 * Hidden notes still appear on hover; they must not cover data on open.
 */
export function hidePayoutCommentVml(vml: string): string {
  const withoutAlwaysShow = vml.replace(/<x:Visible\s*\/>/g, "");
  return withoutAlwaysShow.replace(
    /<v:shape\b([^>]*?)style="([^"]*)"/g,
    (_match, attrs: string, style: string) => {
      let next = style
        .replace(/width:\s*\d+(?:\.\d+)?pt/g, "width:140pt")
        .replace(/height:\s*\d+(?:\.\d+)?pt/g, "height:52pt");
      if (/visibility\s*:/.test(next)) {
        next = next.replace(/visibility\s*:\s*visible/gi, "visibility:hidden");
      } else {
        next = `${next};visibility:hidden`;
      }
      return `<v:shape${attrs}style="${next}"`;
    },
  );
}

function freezeHeaderSheetViewsXml(): string {
  return [
    "<sheetViews>",
    '<sheetView tabSelected="1" workbookViewId="0">',
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>',
    "</sheetView>",
    "</sheetViews>",
  ].join("");
}

function injectPayoutSheetChrome(
  xlsxBytes: Uint8Array,
  endRow: number,
  columnCount: number,
): Uint8Array {
  const unzipped = unzipSync(xlsxBytes);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheetBytes = unzipped[sheetPath];
  if (!sheetBytes) {
    return xlsxBytes;
  }

  let sheetXml = strFromU8(sheetBytes);
  if (sheetXml.includes("<sheetViews>")) {
    sheetXml = sheetXml.replace(
      /<sheetViews>[\s\S]*?<\/sheetViews>/,
      freezeHeaderSheetViewsXml(),
    );
  }

  const lastCol = XLSX.utils.encode_col(columnCount - 1);
  const autoFilterXml = `<autoFilter ref="A1:${lastCol}${endRow}"/>`;
  const validationsXml = buildDataValidationsXml(endRow);
  const afterSheetData = sheetXml.includes("<autoFilter")
    ? validationsXml
    : `${autoFilterXml}${validationsXml}`;

  if (sheetXml.includes("<dataValidations")) {
    sheetXml = insertDataValidationsXml(sheetXml, validationsXml);
    if (!sheetXml.includes("<autoFilter") && sheetXml.includes("</sheetData>")) {
      sheetXml = sheetXml.replace(
        "</sheetData>",
        `</sheetData>${autoFilterXml}`,
      );
    }
  } else if (sheetXml.includes("</sheetData>")) {
    sheetXml = sheetXml.replace(
      "</sheetData>",
      `</sheetData>${afterSheetData}`,
    );
  } else {
    sheetXml = insertDataValidationsXml(sheetXml, validationsXml);
  }

  unzipped[sheetPath] = strToU8(sheetXml);

  const vmlPath = "xl/drawings/vmlDrawing1.vml";
  const vmlBytes = unzipped[vmlPath];
  if (vmlBytes) {
    unzipped[vmlPath] = strToU8(hidePayoutCommentVml(strFromU8(vmlBytes)));
  }

  return zipSync(unzipped, { level: 6 });
}

function emptyPayoutExportRows(): PayoutExportRow[] {
  const blank = Object.fromEntries(
    [...RAZORPAY_UPI_HEADERS, PAYOUT_READINESS_HEADER].map((header) => [
      header,
      "",
    ]),
  ) as PayoutExportRow;
  return [blank];
}

const HEADER_FILL = "FF2F3A4A";
const HEADER_FONT = "FFFFFFFF";
const AMOUNT_NUM_FMT = '"Rs "#,##0';

function stylePayoutSheet(
  worksheet: XLSX.WorkSheet,
  headers: string[],
  rowCount: number,
) {
  worksheet["!cols"] = headers.map((header, index) => ({
    wch:
      header === REFERRAL_COUNT_HEADER || header === REFERRAL_TOTAL_COUNT_HEADER
        ? 20
        : (PAYOUT_COLUMN_WIDTHS[index] ?? 20),
  }));
  worksheet["!rows"] = [{ hpt: 36 }];

  for (let index = 0; index < headers.length; index += 1) {
    const address = XLSX.utils.encode_cell({ r: 0, c: index });
    const cell = worksheet[address];
    if (!cell) continue;
    cell.s = {
      font: { bold: true, color: { rgb: HEADER_FONT }, sz: 11 },
      fill: { patternType: "solid", fgColor: { rgb: HEADER_FILL } },
      alignment: {
        vertical: "center",
        horizontal: "left",
        wrapText: true,
      },
    };
  }

  const amountCol = 2;
  for (let row = 1; row <= rowCount; row += 1) {
    for (let col = 0; col < headers.length; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[address];
      if (!cell) continue;
      if (col === amountCol && typeof cell.v === "number") {
        cell.z = AMOUNT_NUM_FMT;
        cell.s = {
          numFmt: AMOUNT_NUM_FMT,
          alignment: {
            horizontal: "right",
            vertical: "center",
            wrapText: false,
          },
        };
      } else {
        cell.s = {
          alignment: {
            horizontal: "left",
            vertical: "center",
            wrapText: false,
          },
        };
      }
    }
  }
}

function instructionRows(): ExportRow[] {
  return RAZORPAY_UPI_COLUMN_VALIDATIONS.map((rule) => ({
    Column: rule.col,
    Header: rule.header,
    Guidance: `${rule.promptTitle}. ${rule.prompt}`,
  }));
}

/**
 * Builds the RazorpayX UPI workbook bytes (Payouts first). Used by download
 * and by verification scripts so both share the same formatting pipeline.
 */
export function buildRazorpayPayoutExcelBytes(input: {
  payoutRows: PayoutExportRow[];
  filterMeta?: PayoutExportFilterMeta;
}): Uint8Array {
  const rows =
    input.payoutRows.length > 0 ? input.payoutRows : emptyPayoutExportRows();
  const headers = payoutHeaders(rows);

  const payoutSheet = XLSXStyle.utils.json_to_sheet(rows, { header: headers });
  stylePayoutSheet(payoutSheet, headers, rows.length);

  for (const [index, rule] of RAZORPAY_UPI_COLUMN_VALIDATIONS.entries()) {
    const address = XLSX.utils.encode_cell({ r: 0, c: index });
    const cell = payoutSheet[address] ?? { t: "s", v: rule.header };
    cell.c = [
      {
        a: "RazorpayX",
        t: `${rule.promptTitle}\n${rule.prompt}`,
      },
    ];
    payoutSheet[address] = cell;
  }

  const workbook = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(workbook, payoutSheet, "Payouts");

  const guideRows = instructionRows();
  const guideHeaders = ["Column", "Header", "Guidance"];
  const guideSheet = XLSXStyle.utils.json_to_sheet(guideRows, {
    header: guideHeaders,
  });
  applyFormattedHeaderStyles(guideSheet, guideHeaders, true);
  guideSheet["!cols"] = [
    { wch: 10 },
    { wch: 36 },
    { wch: 72 },
  ];
  XLSXStyle.utils.book_append_sheet(workbook, guideSheet, "Instructions");

  if (input.filterMeta) {
    const filterRows: ExportRow[] = [
      { Field: "Payout type", Value: input.filterMeta.payoutType },
      { Field: "Duplicate status", Value: input.filterMeta.duplicateStatus },
      { Field: "Rows in this file", Value: input.filterMeta.rowCount },
      { Field: "Note", Value: input.filterMeta.note },
    ];
    const filterHeaders = ["Field", "Value"];
    const filterSheet = XLSXStyle.utils.json_to_sheet(filterRows, {
      header: filterHeaders,
    });
    applyFormattedHeaderStyles(filterSheet, filterHeaders, true);
    filterSheet["!cols"] = autoColumnWidths(filterRows, filterHeaders);
    XLSXStyle.utils.book_append_sheet(workbook, filterSheet, "Export filter");
  }

  const raw = XLSXStyle.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
  const endRow = Math.max(rows.length + 1, 2);
  return injectPayoutSheetChrome(
    new Uint8Array(raw),
    endRow,
    headers.length,
  );
}

/**
 * RazorpayX UPI bulk-payout workbook with readiness flag appended after the
 * nine template columns. All payout candidates export; missing UPI cells stay empty.
 */
export function downloadRazorpayPayoutExcel(input: {
  filename: string;
  payoutRows: PayoutExportRow[];
  filterMeta?: PayoutExportFilterMeta;
}) {
  triggerDownload(
    input.filename,
    buildRazorpayPayoutExcelBytes(input),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

export function downloadRazorpayPayoutCsv(input: {
  filename: string;
  payoutRows: PayoutExportRow[];
  filterMeta?: PayoutExportFilterMeta;
}) {
  const rows =
    input.payoutRows.length > 0 ? input.payoutRows : emptyPayoutExportRows();
  const headers = payoutHeaders(rows);
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSXStyle.utils.book_append_sheet(workbook, worksheet, "Payouts");
  XLSX.writeFile(workbook, input.filename, { bookType: "csv" });
}
