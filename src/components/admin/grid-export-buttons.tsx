"use client";

import { useState } from "react";
import { DownloadIcon, Loader2Icon, MoreHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastError } from "@/lib/toast";

type GridExportButtonsProps = {
  onExportCsv: () => Promise<void>;
  onExportExcel: () => Promise<void>;
  disabled?: boolean;
};

export function GridExportButtons({
  onExportCsv,
  onExportExcel,
  disabled = false,
}: GridExportButtonsProps) {
  const [isExporting, setIsExporting] = useState<"csv" | "excel" | null>(null);

  async function handleExport(
    type: "csv" | "excel",
    handler: () => Promise<void>,
  ) {
    setIsExporting(type);
    try {
      await handler();
    } catch {
      toastError("Export failed. Please try again.");
    } finally {
      setIsExporting(null);
    }
  }

  const isBusy = isExporting !== null;

  return (
    <>
      <div className="hidden flex-wrap gap-2 sm:flex">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isBusy}
          onClick={() => void handleExport("csv", onExportCsv)}
        >
          {isExporting === "csv" ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <DownloadIcon className="size-4" />
          )}
          Export CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isBusy}
          onClick={() => void handleExport("excel", onExportExcel)}
        >
          {isExporting === "excel" ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <DownloadIcon className="size-4" />
          )}
          Export Excel
        </Button>
      </div>

      <div className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || isBusy}
              className="w-full"
            >
              {isBusy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <MoreHorizontalIcon className="size-4" />
              )}
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() => void handleExport("csv", onExportCsv)}
            >
              Export CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void handleExport("excel", onExportExcel)}
            >
              Export Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
