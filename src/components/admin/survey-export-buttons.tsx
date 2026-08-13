"use client";

import { GridExportButtons } from "@/components/admin/grid-export-buttons";
import { downloadCsv, downloadFormattedExcel } from "@/lib/export";

export function SurveyExportButtons() {
  async function fetchRows() {
    const response = await fetch("/api/admin/survey-responses/export");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Export failed.");
    }

    return payload.rows as Record<string, string | number>[];
  }

  async function handleExportCsv() {
    const rows = await fetchRows();
    downloadCsv("survey-responses.csv", rows);
  }

  async function handleExportExcel() {
    const rows = await fetchRows();
    downloadFormattedExcel("survey-responses.xlsx", "Survey", rows);
  }

  return (
    <GridExportButtons
      onExportCsv={handleExportCsv}
      onExportExcel={handleExportExcel}
    />
  );
}
