import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  RAZORPAY_UPI_COLUMN_VALIDATIONS,
  RAZORPAY_UPI_HEADERS,
  type RazorpayUpiExportRow,
} from "@/lib/payout-export/razorpay-upi-format";

export type ExportRow = Record<string, string | number>;

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
      header === "Started at" || header === "Completed at" ? 26 : 12;
    return { wch: Math.min(Math.max(maxLen + 2, minWidth), 48) };
  });
}

function buildWorksheet(
  rows: ExportRow[],
  options: WorksheetOptions = {},
): XLSX.WorkSheet {
  const headers = options.headers ?? resolveHeaders(rows);
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });

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

export function downloadCsv(filename: string, rows: ExportRow[]) {
  const worksheet = buildWorksheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, filename, { bookType: "csv" });
}

export function downloadExcel(
  filename: string,
  sheetName: string,
  rows: ExportRow[],
) {
  const worksheet = buildWorksheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

export function downloadFormattedExcel(
  filename: string,
  sheetName: string,
  rows: ExportRow[],
) {
  const headers = resolveHeaders(rows);
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
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

function injectDataValidations(
  xlsxBytes: Uint8Array,
  sheetPath: string,
  endRow: number,
): Uint8Array {
  const unzipped = unzipSync(xlsxBytes);
  const sheetBytes = unzipped[sheetPath];
  if (!sheetBytes) {
    return xlsxBytes;
  }

  let sheetXml = strFromU8(sheetBytes);
  const validationsXml = buildDataValidationsXml(endRow);

  if (sheetXml.includes("<dataValidations")) {
    sheetXml = sheetXml.replace(
      /<dataValidations[\s\S]*?<\/dataValidations>/,
      validationsXml,
    );
  } else if (sheetXml.includes("</worksheet>")) {
    sheetXml = sheetXml.replace(
      "</worksheet>",
      `${validationsXml}</worksheet>`,
    );
  }

  unzipped[sheetPath] = strToU8(sheetXml);
  return zipSync(unzipped, { level: 6 });
}

function emptyRazorpayRows(): RazorpayUpiExportRow[] {
  const blank = Object.fromEntries(
    RAZORPAY_UPI_HEADERS.map((header) => [header, ""]),
  ) as RazorpayUpiExportRow;
  return [blank];
}

/**
 * RazorpayX UPI bulk-payout workbook: payable sheet + optional excluded sheet,
 * with Excel data-validation prompts/errors injected into the payout sheet.
 */
export function downloadRazorpayPayoutExcel(input: {
  filename: string;
  payableRows: RazorpayUpiExportRow[];
  excludedRows?: ExportRow[];
}) {
  const payable =
    input.payableRows.length > 0 ? input.payableRows : emptyRazorpayRows();
  const headers = [...RAZORPAY_UPI_HEADERS];

  const payoutSheet = XLSXStyle.utils.json_to_sheet(payable, { header: headers });
  applyFormattedHeaderStyles(payoutSheet, headers, true);
  payoutSheet["!cols"] = autoColumnWidths(payable, headers);
  payoutSheet["!freeze"] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: "A2",
    activePane: "bottomLeft",
    state: "frozen",
  };

  // Header comments mirror template hover prompts even before cells are focused.
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

  if (input.excludedRows && input.excludedRows.length > 0) {
    const excludedHeaders = Object.keys(input.excludedRows[0]!);
    const excludedSheet = XLSXStyle.utils.json_to_sheet(input.excludedRows, {
      header: excludedHeaders,
    });
    applyFormattedHeaderStyles(excludedSheet, excludedHeaders, true);
    excludedSheet["!cols"] = autoColumnWidths(
      input.excludedRows,
      excludedHeaders,
    );
    XLSXStyle.utils.book_append_sheet(
      workbook,
      excludedSheet,
      "Needs UPI incomplete",
    );
  }

  const raw = XLSXStyle.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
  const endRow = Math.max(payable.length + 1, 2);
  const withValidations = injectDataValidations(
    new Uint8Array(raw),
    "xl/worksheets/sheet1.xml",
    endRow,
  );

  triggerDownload(
    input.filename,
    withValidations,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

export function downloadRazorpayPayoutCsv(input: {
  filename: string;
  payableRows: RazorpayUpiExportRow[];
  excludedFilename?: string;
  excludedRows?: ExportRow[];
}) {
  const headers = [...RAZORPAY_UPI_HEADERS];
  const payable =
    input.payableRows.length > 0 ? input.payableRows : emptyRazorpayRows();
  const worksheet = XLSX.utils.json_to_sheet(payable, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Payouts");
  XLSX.writeFile(workbook, input.filename, { bookType: "csv" });

  if (
    input.excludedRows &&
    input.excludedRows.length > 0 &&
    input.excludedFilename
  ) {
    downloadCsv(input.excludedFilename, input.excludedRows);
  }
}
