"use client";

import { useState } from "react";

import { GridExportButtons } from "@/components/admin/grid-export-buttons";
import { downloadCsv, downloadExcelWorkbook } from "@/lib/export";
import type { FtvCodebookRow } from "@/lib/ftv-export";

type FtvExportPayload = {
  headers: string[];
  rows: Record<string, string | number>[];
  codebook: FtvCodebookRow[];
  fieldSummary: Array<Record<string, string | number>>;
};

export function FtvExportButtons({
  canIncludeDeleted = false,
}: {
  canIncludeDeleted?: boolean;
}) {
  const [includeDeleted, setIncludeDeleted] = useState(false);

  async function fetchBundle() {
    const query =
      canIncludeDeleted && includeDeleted ? "?include_deleted=1" : "";
    const response = await fetch(`/api/admin/ftv-responses/export${query}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Export failed.");
    }

    return payload as FtvExportPayload;
  }

  async function handleExportCsv() {
    const bundle = await fetchBundle();
    downloadCsv("ftv-responses.csv", bundle.rows, bundle.headers);
  }

  async function handleExportExcel() {
    const bundle = await fetchBundle();
    downloadExcelWorkbook("ftv-responses.xlsx", [
      { name: "Responses", rows: bundle.rows, headers: bundle.headers },
      {
        name: "Codebook",
        rows: bundle.codebook as unknown as Record<string, string | number>[],
        headers: ["qid", "question", "type", "code", "label"],
      },
      {
        name: "Field Summary",
        rows: bundle.fieldSummary,
        headers: ["status", "n", "pct", "avg completion minutes"],
      },
    ]);
  }

  return (
    <div className="space-y-2">
      {canIncludeDeleted ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-plum-muted">
          <input
            type="checkbox"
            className="size-4 rounded border-border accent-primary"
            checked={includeDeleted}
            onChange={(event) => setIncludeDeleted(event.target.checked)}
          />
          Include deleted (audit)
        </label>
      ) : null}
      <GridExportButtons
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
      />
    </div>
  );
}
