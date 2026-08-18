"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DuplicateStatusBadge } from "@/components/admin/duplicate-status-badge";
import { RespondentDrawerTimeline } from "@/components/admin/respondent-drawer-timeline";
import { RespondentDeleteDialog } from "@/components/admin/respondent-delete-dialog";
import { Button } from "@/components/ui/button";
import {
  SurveyCompletionStatusBadge,
  TerminationReasonDrawerValue,
  TerminationReasonTableCell,
} from "@/components/admin/admin-text-display";
import {
  BulkActionToolbar,
  SelectAllFilteredBanner,
  SelectableRowCheckboxCell,
  TableCheckbox,
  TablePagination,
  type BulkAction,
} from "@/components/admin/bulk-selection";
import { adminPath } from "@/lib/admin-paths";
import { buildReferralLink } from "@/lib/referral-code";
import { dismissToast, toastError, toastLoading, toastSuccess } from "@/lib/toast";
import {
  isTerminatedStatus,
  normalizeParticipantStatus,
} from "@/lib/participant-lifecycle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  StatusPill,
  type StatusPillVariant,
} from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBulkTableState } from "@/hooks/use-bulk-table-state";
import { fetchFtvExportBundle } from "@/lib/bulk-selection/bulk-actions-client";
import { GridExportButtons } from "@/components/admin/grid-export-buttons";
import {
  exportParticipantList,
  exportParticipantRows,
  rowsToParticipantExport,
} from "@/lib/bulk-selection/participant-export";
import { downloadCsv, downloadExcelWorkbook } from "@/lib/export";
import {
  DUPLICATE_FILTER_OPTIONS,
  formatDuplicateStatusLabel,
  isAnyDuplicate,
  matchesDuplicateFilter,
  type DuplicateFilter,
} from "@/lib/respondents/duplicate-visibility";
import {
  computeEffectiveQcStatus,
  matchesQcFilter,
  type QcFilter,
  QC_FILTER_OPTIONS,
  type QcStatusValue,
} from "@/lib/respondents/qc-status";
import { QcOverrideModal, type QcOverrideTarget } from "@/components/admin/qc-override-modal";
import { QcStatusBadge, QcTableCell } from "@/components/admin/qc-status-badge";

export type RespondentTableRow = {
  leadId: string;
  referralCode: string;
  fullName: string;
  mobile: string;
  dob: string;
  city: string | null;
  status: string;
  referredBy: string | null;
  isFlaggedDuplicate: boolean;
  duplicateFlag: boolean;
  duplicateReason: string | null;
  duplicateDetectedAt: string | null;
  reviewStatus: string;
  originalParticipantLeadId: string | null;
  duplicateClusterId: string | null;
  isFingerprintClusterOriginal: boolean;
  duplicateGamingPattern: string | null;
  deviceFingerprint: string | null;
  ipAddress: string | null;
  hasScreener: boolean;
  screenerCompletionStatus: string | null;
  screenerTerminationReason: string | null;
  acquisitionSource: string | null;
  acquisitionType: string | null;
  referralPlatform: string | null;
  otherSource: string | null;
  createdAt: string;
  qcStatusOverride: QcStatusValue | null;
  surveyDataIncomplete: boolean;
};

type RespondentsTableProps = {
  participants: RespondentTableRow[];
  canDelete?: boolean;
};

type StatusFilter =
  | "all"
  | "terminated"
  | "completed"
  | "successful"
  | "unsuccessful";

/** Extensible screener outcome filter — toggle uses all | hide_terminated today. */
type ScreenerOutcomeFilter =
  | "all"
  | "hide_terminated"
  | "completed_only"
  | "terminated_only";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "terminated", label: "Terminated" },
  { value: "completed", label: "Completed" },
  { value: "successful", label: "Successful" },
  { value: "unsuccessful", label: "Unsuccessful" },
];

function statusVariant(status: string): StatusPillVariant {
  const normalized = normalizeParticipantStatus(status) ?? status.toLowerCase();
  if (normalized === "terminated" || normalized === "unsuccessful") {
    return "notEligible";
  }
  if (normalized === "completed") return "completed";
  if (normalized === "successful" || normalized === "review_pass" || normalized === "paid") {
    return "success";
  }
  if (normalized === "review_fail") return "fail";
  if (normalized.includes("pending")) return "pending";
  return "lead";
}

function matchesStatusFilter(status: string, filter: StatusFilter) {
  if (filter === "all") return true;
  const normalized = normalizeParticipantStatus(status);
  if (!normalized) return false;
  if (filter === "completed") {
    return (
      normalized === "completed" ||
      normalized === "review_pass" ||
      normalized === "review_fail"
    );
  }
  return normalized === filter;
}

function matchesScreenerOutcomeFilter(
  completionStatus: string | null,
  filter: ScreenerOutcomeFilter,
) {
  switch (filter) {
    case "all":
      return true;
    case "hide_terminated":
      return completionStatus !== "Terminated";
    case "completed_only":
      return completionStatus === "Completed";
    case "terminated_only":
      return completionStatus === "Terminated";
    default:
      return true;
  }
}

const ACQUISITION_TYPE_FILTERS = ["all", "direct", "referral"] as const;
type AcquisitionTypeFilter = (typeof ACQUISITION_TYPE_FILTERS)[number];

function displaySource(row: RespondentTableRow): string {
  if (!row.acquisitionSource) return "—";
  if (row.acquisitionSource === "Other" && row.otherSource) {
    return `Other: ${row.otherSource}`;
  }
  return row.acquisitionSource;
}

export function RespondentsTable({
  participants,
  canDelete = false,
}: RespondentsTableProps) {
  const router = useRouter();
  const [rows, setRows] = useState(participants);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [acquisitionTypeFilter, setAcquisitionTypeFilter] =
    useState<AcquisitionTypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [screenerOutcomeFilter, setScreenerOutcomeFilter] =
    useState<ScreenerOutcomeFilter>("all");
  const [duplicateFilter, setDuplicateFilter] =
    useState<DuplicateFilter>("all");
  const [qcFilter, setQcFilter] = useState<QcFilter>("all");
  const [selected, setSelected] = useState<RespondentTableRow | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<QcOverrideTarget | null>(
    null,
  );
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [qcLog, setQcLog] = useState<
    Array<{
      id: string;
      previousEffectiveStatus: string;
      newEffectiveStatus: string;
      reason: string;
      changedByEmail: string;
      createdAt: string;
    }>
  >([]);
  const [deleteTarget, setDeleteTarget] = useState<RespondentTableRow | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setRows(participants);
  }, [participants]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.acquisitionSource) set.add(row.acquisitionSource);
    }
    return Array.from(set).sort();
  }, [rows]);

  const platformOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.referralPlatform) set.add(row.referralPlatform);
    }
    return Array.from(set).sort();
  }, [rows]);

  const terminatedCount = useMemo(
    () =>
      rows.filter((row) => row.screenerCompletionStatus === "Terminated")
        .length,
    [rows],
  );

  const duplicateCount = useMemo(
    () => rows.filter((row) => isAnyDuplicate(row)).length,
    [rows],
  );

  const rowsBeforeDuplicateFilter = useMemo(
    () =>
      rows.filter((row) => {
        if (
          !matchesScreenerOutcomeFilter(
            row.screenerCompletionStatus,
            screenerOutcomeFilter,
          )
        ) {
          return false;
        }
        if (!matchesStatusFilter(row.status, statusFilter)) return false;
        if (
          acquisitionTypeFilter !== "all" &&
          (row.acquisitionType ?? "") !== acquisitionTypeFilter
        ) {
          return false;
        }
        if (
          sourceFilter !== "all" &&
          (row.acquisitionSource ?? "") !== sourceFilter
        ) {
          return false;
        }
        if (
          platformFilter !== "all" &&
          (row.referralPlatform ?? "") !== platformFilter
        ) {
          return false;
        }
        if (!matchesQcFilter(row, qcFilter)) return false;
        return true;
      }),
    [
      rows,
      screenerOutcomeFilter,
      statusFilter,
      acquisitionTypeFilter,
      sourceFilter,
      platformFilter,
      qcFilter,
    ],
  );

  const visibleDuplicateCount = useMemo(
    () => rowsBeforeDuplicateFilter.filter((row) => isAnyDuplicate(row)).length,
    [rowsBeforeDuplicateFilter],
  );

  const filteredRows = useMemo(
    () =>
      rowsBeforeDuplicateFilter.filter((row) =>
        matchesDuplicateFilter(row, duplicateFilter),
      ),
    [rowsBeforeDuplicateFilter, duplicateFilter],
  );

  const {
    bulk,
    pagination,
    filteredIds,
    pageIds,
    headerCheckboxState,
    showSelectAllFilteredBanner,
  } = useBulkTableState(filteredRows);

  useEffect(() => {
    pagination.setPage(1);
    // Intentionally reset only when filters change; pagination object identity is unstable.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPage is stable enough for this reset
  }, [
    statusFilter,
    duplicateFilter,
    qcFilter,
    screenerOutcomeFilter,
    acquisitionTypeFilter,
    sourceFilter,
    platformFilter,
  ]);

  async function handleDeleteRespondent(reason: string) {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/admin/respondents/${encodeURIComponent(deleteTarget.leadId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete respondent.");
      }
      const slot = payload.slot as
        | {
            cityName?: string | null;
            newCount?: number;
            capacity?: number | null;
          }
        | undefined;
      setRows((current) =>
        current.filter((row) => row.leadId !== deleteTarget.leadId),
      );
      setSelected(null);
      setDeleteTarget(null);
      toastSuccess(
        slot?.cityName
          ? `Deleted. ${slot.cityName} is now ${slot.newCount}/${slot.capacity ?? "—"}.`
          : "Respondent deleted.",
      );
      router.refresh();
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  const listFiltersActive =
    statusFilter !== "all" ||
    acquisitionTypeFilter !== "all" ||
    sourceFilter !== "all" ||
    platformFilter !== "all" ||
    screenerOutcomeFilter !== "all" ||
    duplicateFilter !== "all" ||
    qcFilter !== "all";

  useEffect(() => {
    if (!selected) {
      setQcLog([]);
      return;
    }
    void fetch(
      `/api/admin/respondents/${encodeURIComponent(selected.leadId)}/qc-override`,
    )
      .then((res) => res.json())
      .then((payload) => {
        if (Array.isArray(payload.log)) setQcLog(payload.log);
      })
      .catch(() => setQcLog([]));
  }, [selected?.leadId]);

  function openOverrideModal(row: RespondentTableRow, newOverride: QcStatusValue) {
    setOverrideTarget({
      leadId: row.leadId,
      fullName: row.fullName,
      newOverride,
      status: row.status,
      duplicateFlag: row.duplicateFlag,
      isFlaggedDuplicate: row.isFlaggedDuplicate,
      originalParticipantLeadId: row.originalParticipantLeadId,
      duplicateClusterId: row.duplicateClusterId,
      isFingerprintClusterOriginal: row.isFingerprintClusterOriginal,
      duplicateGamingPattern: row.duplicateGamingPattern,
      qcStatusOverride: row.qcStatusOverride,
    });
  }

  async function handleQcOverrideConfirm(reason: string) {
    if (!overrideTarget) return;
    setOverrideBusy(true);
    const loadingId = toastLoading("Saving QC override...");
    try {
      const response = await fetch(
        `/api/admin/respondents/${encodeURIComponent(overrideTarget.leadId)}/qc-override`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            override: overrideTarget.newOverride,
            reason,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to apply QC override.");
      }

      setRows((current) =>
        current.map((row) =>
          row.leadId === overrideTarget.leadId
            ? {
                ...row,
                qcStatusOverride: overrideTarget.newOverride,
              }
            : row,
        ),
      );
      setSelected((current) =>
        current?.leadId === overrideTarget.leadId
          ? { ...current, qcStatusOverride: overrideTarget.newOverride }
          : current,
      );
      dismissToast(loadingId);
      toastSuccess("QC override saved.");
      setOverrideTarget(null);
      router.refresh();
    } catch (error) {
      dismissToast(loadingId);
      toastError(
        error instanceof Error ? error.message : "Failed to apply QC override.",
      );
    } finally {
      setOverrideBusy(false);
    }
  }

  function exportFilteredList(format: "csv" | "excel") {
    if (filteredRows.length === 0) {
      toastError("Nothing to export.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const suffix = listFiltersActive ? "-filtered" : "";
    exportParticipantList(filteredRows, format, `respondents${suffix}-${stamp}`);
  }

  async function handleExportParticipantsSelected() {
    try {
      const selectedRows = filteredRows.filter((row) =>
        bulk.selectedIds.has(row.leadId),
      );
      exportParticipantRows(
        rowsToParticipantExport(selectedRows),
        "respondents-selected.csv",
      );
    } catch {
      toastError("Export failed. Please try again.");
    }
  }

  async function handleExportSelected(format: "csv" | "excel") {
    const loadingId = toastLoading("Exporting selected respondents...");
    try {
      const bundle = await fetchFtvExportBundle(bulk.selectedIdList);
      if (format === "csv") {
        downloadCsv("ftv-responses-selected.csv", bundle.rows, bundle.headers);
      } else {
        downloadExcelWorkbook("ftv-responses-selected.xlsx", [
          { name: "Responses", rows: bundle.rows, headers: bundle.headers },
          {
            name: "Codebook",
            rows: bundle.codebook,
            headers: ["qid", "question", "type", "code", "label"],
          },
          {
            name: "Field Summary",
            rows: bundle.fieldSummary,
            headers: ["status", "n", "pct", "avg completion minutes"],
          },
        ]);
      }
      dismissToast(loadingId);
      toastSuccess("Export ready.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Export failed.");
    }
  }

  const bulkActions: BulkAction[] = [
    {
      id: "export-participants",
      label: "Export Selected",
      onClick: () => void handleExportParticipantsSelected(),
    },
    {
      id: "export-screener",
      label: "Export Responses",
      onClick: () => void handleExportSelected("csv"),
    },
  ];

  return (
    <div className="space-y-4 pb-24">
      <div className="-mx-1 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            size="sm"
            variant={statusFilter === filter.value ? "default" : "outline"}
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <div className="-mx-1 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1">
        {DUPLICATE_FILTER_OPTIONS.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            size="sm"
            variant={duplicateFilter === filter.value ? "default" : "outline"}
            onClick={() => setDuplicateFilter(filter.value)}
          >
            {filter.label}
            {filter.value === "duplicates" && visibleDuplicateCount > 0
              ? ` (${visibleDuplicateCount})`
              : ""}
          </Button>
        ))}
      </div>

      <div className="-mx-1 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1">
        {QC_FILTER_OPTIONS.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            size="sm"
            variant={qcFilter === filter.value ? "default" : "outline"}
            onClick={() => setQcFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-plum-muted">
          <input
            type="checkbox"
            checked={screenerOutcomeFilter === "all"}
            onChange={(event) =>
              setScreenerOutcomeFilter(
                event.target.checked ? "all" : "hide_terminated",
              )
            }
            className="size-4 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          Show terminated
          {terminatedCount > 0 ? ` (${terminatedCount})` : ""}
        </label>

        <label className="flex items-center gap-2 text-xs font-semibold text-plum-muted">
          Acquisition type
          <select
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
            value={acquisitionTypeFilter}
            onChange={(event) =>
              setAcquisitionTypeFilter(
                event.target.value as AcquisitionTypeFilter,
              )
            }
          >
            {ACQUISITION_TYPE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === "all" ? "All" : value}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs font-semibold text-plum-muted">
          Source
          <select
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
          >
            <option value="all">All</option>
            {sourceOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs font-semibold text-plum-muted">
          Referral platform
          <select
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
          >
            <option value="all">All</option>
            {platformOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex flex-col items-start gap-1 sm:items-end">
          <p className="text-xs font-medium text-plum-muted">
            List export (current filters)
          </p>
          <GridExportButtons
            disabled={filteredRows.length === 0}
            onExportCsv={async () => exportFilteredList("csv")}
            onExportExcel={async () => exportFilteredList("excel")}
          />
        </div>
      </div>

      {showSelectAllFilteredBanner ? (
        <SelectAllFilteredBanner
          pageCount={pageIds.length}
          filteredCount={filteredIds.length}
          onSelectAllFiltered={() => bulk.selectAllFiltered(filteredIds)}
        />
      ) : null}

      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-rose-tint shadow-sm">
            <TableRow>
              <TableHead className="w-10 pr-0">
                <TableCheckbox
                  checked={headerCheckboxState === "checked"}
                  indeterminate={headerCheckboxState === "indeterminate"}
                  ariaLabel="Select all rows on this page"
                  onChange={() => bulk.toggleAllCurrentPage(pageIds)}
                />
              </TableHead>
              <TableHead>Lead ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>DOB</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Termination Reason</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Ref. platform</TableHead>
              <TableHead>Survey</TableHead>
              <TableHead className="min-w-[5.5rem]">QC</TableHead>
              <TableHead>Duplicate</TableHead>
              <TableHead>Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={15}
                  className="py-8 text-center text-muted-foreground"
                >
                  {rows.length === 0
                    ? "No respondents yet."
                    : duplicateFilter === "duplicates" &&
                        visibleDuplicateCount === 0 &&
                        duplicateCount > 0
                      ? `No duplicates match the current filters. ${duplicateCount} duplicate(s) are hidden — enable “Show terminated” or clear other filters.`
                      : "No respondents match this filter."}
                </TableCell>
              </TableRow>
            ) : (
              pagination.pageItems.map((participant) => (
                <TableRow
                  key={participant.leadId}
                  className="cursor-pointer"
                  onClick={() => setSelected(participant)}
                >
                  <SelectableRowCheckboxCell
                    leadId={participant.leadId}
                    nameLabel={participant.fullName}
                    checked={bulk.isSelected(participant.leadId)}
                    onToggle={bulk.toggleSelection}
                  />
                  <TableCell className="font-mono text-[11.5px] text-muted-foreground">
                    {participant.leadId}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold">{participant.fullName}</span>
                    {participant.referralCode ? (
                      <div className="font-mono text-[11.5px] text-muted-foreground">
                        {participant.referralCode}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-[12.5px]">
                    {participant.mobile}
                  </TableCell>
                  <TableCell>{participant.dob}</TableCell>
                  <TableCell>{participant.city ?? "—"}</TableCell>
                  <TableCell>
                    <StatusPill variant={statusVariant(participant.status)}>
                      {participant.status}
                    </StatusPill>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <TerminationReasonTableCell
                      completionStatus={participant.screenerCompletionStatus}
                      terminationReason={participant.screenerTerminationReason}
                    />
                  </TableCell>
                  <TableCell className="text-xs">
                    {displaySource(participant)}
                  </TableCell>
                  <TableCell className="text-xs capitalize">
                    {participant.acquisitionType ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs capitalize">
                    {participant.referralPlatform ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusPill
                      variant={participant.hasScreener ? "completed" : "lead"}
                    >
                      {participant.hasScreener ? "Submitted" : "Missing"}
                    </StatusPill>
                  </TableCell>
                  <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                    <QcTableCell
                      row={participant}
                      onRequestOverride={(newOverride) =>
                        openOverrideModal(participant, newOverride)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <DuplicateStatusBadge row={participant} />
                  </TableCell>
                  <TableCell>{participant.createdAt}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <TablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.goToPage}
        />
      </div>

      <BulkActionToolbar
        selectedCount={bulk.selectedCount}
        actions={bulkActions}
        onClear={bulk.clearSelection}
      />

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <SheetContent className="w-full max-w-[480px] gap-0 bg-background p-0 sm:max-w-[480px]">
          {selected ? (
            <>
              <SheetHeader className="border-b border-border bg-card p-6">
                <SheetTitle className="text-lg font-bold text-foreground">
                  {selected.fullName}
                </SheetTitle>
                <p className="font-mono text-xs text-muted-foreground">
                  {selected.mobile}
                  {selected.city ? ` · ${selected.city}` : ""}
                </p>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-6">
                {isAnyDuplicate(selected) ? (
                  <div className="mb-5 rounded-[10px] border border-error/30 border-l-4 border-l-error bg-error/10 p-4 text-sm text-error">
                    <span className="font-semibold">Duplicate detected.</span>{" "}
                    {formatDuplicateStatusLabel(selected)} — review before
                    payout or referral approval.
                  </div>
                ) : null}

                <SectionTitle>Participant record</SectionTitle>
                <DetailRow label="Lead ID" value={selected.leadId} mono />
                <DetailRow
                  label="Referral code"
                  value={selected.referralCode}
                  mono
                />
                <DetailRow label="Mobile" value={selected.mobile} mono />
                <DetailRow label="DOB" value={selected.dob} />
                <DetailRow label="City" value={selected.city ?? "—"} />
                <DetailRow
                  label="Referred by"
                  value={selected.referredBy ?? "—"}
                  mono
                />
                <DetailRow label="Registered" value={selected.createdAt} />

                <SectionTitle>Acquisition</SectionTitle>
                <DetailRow label="Heard via" value={displaySource(selected)} />
                <DetailRow
                  label="Acquisition type"
                  value={selected.acquisitionType ?? "—"}
                />
                <DetailRow
                  label="Referral platform"
                  value={selected.referralPlatform ?? "—"}
                />

                <SectionTitle>Duplicate</SectionTitle>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3 text-sm">
                    <span className="text-plum-muted">Duplicate status</span>
                    <DuplicateStatusBadge row={selected} />
                  </div>
                  <DetailRow
                    label="Match type"
                    value={formatDuplicateStatusLabel(selected)}
                  />
                  <DetailRow
                    label="Duplicate reason"
                    value={selected.duplicateReason ?? "—"}
                  />
                  <DetailRow
                    label="Device fingerprint"
                    value={selected.deviceFingerprint ?? "—"}
                    mono
                  />
                  <DetailRow
                    label="IP address"
                    value={selected.ipAddress ?? "—"}
                    mono
                  />
                  <DetailRow
                    label="First seen (original lead)"
                    value={selected.originalParticipantLeadId ?? "—"}
                    mono
                  />
                  <DetailRow
                    label="Cluster ID"
                    value={selected.duplicateClusterId ?? "—"}
                    mono
                  />
                  <DetailRow
                    label="Role in cluster"
                    value={
                      !selected.duplicateClusterId
                        ? "—"
                        : selected.isFingerprintClusterOriginal
                          ? "Original (first seen)"
                          : "Later entry"
                    }
                  />
                  <DetailRow
                    label="Gaming pattern"
                    value={
                      selected.duplicateGamingPattern === "screener_evasion"
                        ? "⚠ Screener evasion (earlier entry terminated)"
                        : "—"
                    }
                  />
                  <DetailRow
                    label="Detected at"
                    value={selected.duplicateDetectedAt ?? "—"}
                  />
                  <DetailRow
                    label="Review status"
                    value={selected.reviewStatus}
                  />
                </div>

                <SectionTitle>Status</SectionTitle>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3 text-sm">
                    <span className="text-plum-muted">Lifecycle status</span>
                    <StatusPill variant={statusVariant(selected.status)}>
                      {selected.status}
                    </StatusPill>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3 text-sm">
                    <span className="text-plum-muted">Survey</span>
                    <StatusPill
                      variant={selected.hasScreener ? "completed" : "lead"}
                    >
                      {selected.hasScreener ? "Submitted" : "Missing"}
                    </StatusPill>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3 text-sm">
                    <span className="text-plum-muted">Survey status</span>
                    <SurveyCompletionStatusBadge
                      completionStatus={selected.screenerCompletionStatus}
                    />
                  </div>
                  <div className="flex items-start justify-between gap-4 border-b border-dashed border-border pb-3 text-sm">
                    <span className="shrink-0 text-plum-muted">
                      Termination reason
                    </span>
                    <TerminationReasonDrawerValue
                      completionStatus={selected.screenerCompletionStatus}
                      terminationReason={selected.screenerTerminationReason}
                      className="max-w-[65%]"
                    />
                  </div>
                  {isTerminatedStatus(selected.status) ? (
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link href={adminPath("/terminations")}>View termination log</Link>
                    </Button>
                  ) : null}
                </div>

                <SectionTitle>Referral</SectionTitle>
                <DetailRow
                  label="Referral code"
                  value={selected.referralCode}
                  mono
                />
                <DetailRow
                  label="Referred by"
                  value={selected.referredBy ?? "—"}
                  mono
                />
                <DetailRow
                  label="Referral link"
                  value={buildReferralLink(selected.referralCode)}
                />

                <SectionTitle>Activity timeline</SectionTitle>
                <RespondentDrawerTimeline leadId={selected.leadId} />

                <SectionTitle>Actions</SectionTitle>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link
                    href={adminPath(`/respondents/${encodeURIComponent(selected.leadId)}`)}
                  >
                    View full record
                  </Link>
                </Button>
                {canDelete ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="mt-2 w-full"
                    onClick={() => setDeleteTarget(selected)}
                  >
                    Delete respondent
                  </Button>
                ) : null}

                <SectionTitle>Quality control</SectionTitle>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3 text-sm">
                    <span className="text-plum-muted">QC status</span>
                    <QcStatusBadge row={selected} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["fail", "review"] as const).includes(
                      computeEffectiveQcStatus(selected),
                    ) ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openOverrideModal(selected, "pass")}
                      >
                        Override to Pass
                      </Button>
                    ) : null}
                    {computeEffectiveQcStatus(selected) === "pass" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openOverrideModal(selected, "fail")}
                      >
                        Override to Fail
                      </Button>
                    ) : null}
                  </div>
                  {qcLog.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-plum-muted">
                        Override history
                      </p>
                      <ul className="max-h-40 space-y-2 overflow-y-auto text-xs">
                        {qcLog.map((entry) => (
                          <li
                            key={entry.id}
                            className="rounded-lg border border-border bg-accent-soft/40 p-2"
                          >
                            <p className="font-medium text-foreground">
                              {entry.previousEffectiveStatus} →{" "}
                              {entry.newEffectiveStatus}
                            </p>
                            <p className="mt-1 text-plum-muted">{entry.reason}</p>
                            <p className="mt-1 text-[10px] text-plum-faint">
                              {entry.changedByEmail} ·{" "}
                              {new Date(entry.createdAt).toLocaleString("en-IN")}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-plum-muted">No overrides logged yet.</p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <QcOverrideModal
        target={overrideTarget}
        busy={overrideBusy}
        onOpenChange={(open) => {
          if (!open) setOverrideTarget(null);
        }}
        onConfirm={handleQcOverrideConfirm}
      />

      {canDelete ? (
        <RespondentDeleteDialog
          target={
            deleteTarget
              ? {
                  leadId: deleteTarget.leadId,
                  fullName: deleteTarget.fullName,
                  city: deleteTarget.city,
                  status: deleteTarget.status,
                  createdAt: deleteTarget.createdAt,
                }
              : null
          }
          busy={deleting}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          onConfirm={(reason) => void handleDeleteRespondent(reason)}
        />
      ) : null}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 mt-5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground first:mt-0">
      {children}
    </p>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-border py-2 text-sm">
      <span className="text-plum-muted">{label}</span>
      <span
        className={
          mono
            ? "font-mono font-semibold text-foreground"
            : "font-semibold text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
