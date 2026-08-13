"use client";

import { GridExportButtons } from "@/components/admin/grid-export-buttons";
import { downloadCsv, downloadExcel } from "@/lib/export";

export function ScreenerExportButtons() {
  async function fetchRows() {
    const response = await fetch("/api/admin/screener-responses/export");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Export failed.");
    }

    return payload.rows as Record<string, string | number>[];
  }

  async function handleExportCsv() {
    const rows = await fetchRows();
    downloadCsv("screener-responses.csv", rows);
  }

  async function handleExportExcel() {
    const rows = await fetchRows();
    downloadExcel("screener-responses.xlsx", "Screener", rows);
  }

  return (
    <GridExportButtons
      onExportCsv={handleExportCsv}
      onExportExcel={handleExportExcel}
    />
  );
}
