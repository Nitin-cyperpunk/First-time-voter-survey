"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DuplicateStatusBadge } from "@/components/admin/duplicate-status-badge";
import { DmStatusBadge } from "@/components/admin/dm-status-badge";
import { RespondentDrawerTimeline } from "@/components/admin/respondent-drawer-timeline";
import { VerificationStatusBadge } from "@/components/admin/verification-status-badge";
import { Button } from "@/components/ui/button";
import {
  SurveyCompletionStatusBadge,
  TerminationReasonDrawerValue,
  TerminationReasonTableCell,
} from "@/components/admin/admin-text-display";
import {
  BulkActionToolbar,
  BulkConfirmDialog,
  SelectAllFilteredBanner,
  SelectableRowCheckboxCell,
  TableCheckbox,
  TablePagination,
  type BulkAction,
} from "@/components/admin/bulk-selection";
import { ParticipantMessageRowCells } from "@/features/message-templates/components/participant-message-row-cells";
import { InstagramIdEditableCell } from "@/features/message-templates/components/instagram-id-editable-cell";
import { InstagramVisibilityToggle } from "@/features/message-templates/components/instagram-visibility-toggle";
import { useAdminMessageTemplates } from "@/features/message-templates/hooks/use-admin-message-templates";
import { persistParticipantInstagramVisibility } from "@/lib/instagram";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import { getRenderedMessage } from "@/lib/message-templates/client";
import { buildReferralLink } from "@/lib/referral-code";
import { buildRefillLink } from "@/lib/refill-link";
import {
  dismissToast,
  toastEligibilityUpdated,
  toastError,
  toastLoading,
  toastRefillRequestSent,
  toastSuccess,
} from "@/lib/toast";
import { canAdminSetEligibility } from "@/lib/participant-lifecycle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  fetchScreenerExportRows,
  postBulkLeadIds,
  runBulkActionWithToast,
} from "@/lib/bulk-selection/bulk-actions-client";
import {
  exportParticipantRows,
  rowsToParticipantExport,
} from "@/lib/bulk-selection/participant-export";
import { downloadCsv, downloadExcel } from "@/lib/export";
import {
  DUPLICATE_FILTER_OPTIONS,
  formatDuplicateStatusLabel,
  isAnyDuplicate,
  matchesDuplicateFilter,
  type DuplicateFilter,
} from "@/lib/respondents/duplicate-visibility";

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
  deviceFingerprint: string | null;
  ipAddress: string | null;
  hasScreener: boolean;
  screenerCompletionStatus: string | null;
  screenerTerminationReason: string | null;
  acquisitionSource: string | null;
  acquisitionType: string | null;
  referralPlatform: string | null;
  otherSource: string | null;
  surveyAccessGranted: boolean;
  verifiedAt: string | null;
  verificationMethod: string | null;
  dmStatus: string | null;
  instagramId: string | null;
  instagramVisibility: "public" | "private";
  eligibilityOverrideReason: string | null;
  refillRequired: boolean;
  refillReason: string | null;
  refillUrl: string | null;
  surveyUrl: string | null;
  createdAt: string;
};

type RespondentsTableProps = {
  participants: RespondentTableRow[];
  canVerify?: boolean;
};

type StatusFilter =
  | "all"
  | "lead"
  | "under_review"
  | "eligible"
  | "not_eligible"
  | "completed"
  | "successful"
  | "unsuccessful";

/** Extensible screener outcome filter — toggle uses all | hide_terminated today. */
type ScreenerOutcomeFilter =
  | "all"
  | "hide_terminated"
  | "completed_only"
  | "terminated_only";

type RefillAction = {
  leadId: string;
  fullName: string;
  mobile: string;
};

type EligibilityAction = {
  leadId: string;
  fullName: string;
  eligibility: "eligible" | "not_eligible";
};

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "lead", label: "Lead" },
  { value: "under_review", label: "Under Review" },
  { value: "eligible", label: "Eligible" },
  { value: "not_eligible", label: "Not Eligible" },
  { value: "completed", label: "Completed" },
  { value: "successful", label: "Successful" },
  { value: "unsuccessful", label: "Unsuccessful" },
];

function statusVariant(status: string): StatusPillVariant {
  const normalized = status.toLowerCase();
  if (normalized.includes("not") || normalized === "unsuccessful")
    return "notEligible";
  if (normalized === "eligible") return "eligible";
  if (normalized === "under_review") return "review";
  if (normalized === "completed") return "completed";
  if (normalized === "successful" || normalized === "review_pass")
    return "success";
  if (normalized === "review_fail") return "fail";
  if (normalized.includes("pending")) return "pending";
  return "lead";
}

function canRequestRefill(status: string) {
  return status !== "paid";
}

function canRunQc(status: string) {
  return status === "completed";
}

function matchesStatusFilter(status: string, filter: StatusFilter) {
  if (filter === "all") return true;
  return status.toLowerCase() === filter;
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

function participantForDmBadge(row: RespondentTableRow) {
  return {
    status: row.status,
    verifiedAt: row.verifiedAt ? new Date(row.verifiedAt) : null,
    surveyAccessGranted: row.surveyAccessGranted,
    dmStatus: row.dmStatus,
  };
}

export function RespondentsTable({
  participants,
  canVerify = false,
}: RespondentsTableProps) {
  const router = useRouter();
  const { templates, loading: templatesLoading } = useAdminMessageTemplates();
  const [rows, setRows] = useState(participants);

  function handleInstagramIdSaved(leadId: string, instagramId: string | null) {
    setRows((current) =>
      current.map((row) =>
        row.leadId === leadId ? { ...row, instagramId } : row,
      ),
    );
    setSelected((current) =>
      current?.leadId === leadId ? { ...current, instagramId } : current,
    );
  }

  function handleInstagramVisibilitySaved(
    leadId: string,
    instagramVisibility: "public" | "private",
  ) {
    setRows((current) =>
      current.map((row) =>
        row.leadId === leadId ? { ...row, instagramVisibility } : row,
      ),
    );
    setSelected((current) =>
      current?.leadId === leadId
        ? { ...current, instagramVisibility }
        : current,
    );
  }

  async function handleDrawerVisibilityChange(
    leadId: string,
    next: "public" | "private",
  ) {
    const previous =
      rows.find((row) => row.leadId === leadId)?.instagramVisibility ??
      "public";
    handleInstagramVisibilitySaved(leadId, next);
    try {
      const saved = await persistParticipantInstagramVisibility(leadId, next);
      handleInstagramVisibilitySaved(leadId, saved);
    } catch (error) {
      handleInstagramVisibilitySaved(leadId, previous);
      toastError(
        error instanceof Error
          ? error.message
          : "Failed to save Instagram visibility.",
      );
    }
  }

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [acquisitionTypeFilter, setAcquisitionTypeFilter] =
    useState<AcquisitionTypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [screenerOutcomeFilter, setScreenerOutcomeFilter] =
    useState<ScreenerOutcomeFilter>("all");
  const [duplicateFilter, setDuplicateFilter] =
    useState<DuplicateFilter>("all");
  const [selected, setSelected] = useState<RespondentTableRow | null>(null);
  const [qcUpdating, setQcUpdating] = useState<"pass" | "fail" | null>(null);
  const [refillAction, setRefillAction] = useState<RefillAction | null>(null);
  const [refillReason, setRefillReason] = useState("");
  const [refillUpdatingLeadId, setRefillUpdatingLeadId] = useState<
    string | null
  >(null);
  const [eligibilityAction, setEligibilityAction] =
    useState<EligibilityAction | null>(null);
  const [eligibilityReason, setEligibilityReason] = useState("");
  const [eligibilityUpdatingLeadId, setEligibilityUpdatingLeadId] = useState<
    string | null
  >(null);
  const [messageConfirmOpen, setMessageConfirmOpen] = useState(false);
  const [verifyConfirmOpen, setVerifyConfirmOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [bulkVerifyReason, setBulkVerifyReason] = useState("");
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

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
        return true;
      }),
    [
      rows,
      screenerOutcomeFilter,
      statusFilter,
      acquisitionTypeFilter,
      sourceFilter,
      platformFilter,
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
  }, [
    statusFilter,
    duplicateFilter,
    screenerOutcomeFilter,
    acquisitionTypeFilter,
    sourceFilter,
    platformFilter,
    pagination.setPage,
  ]);

  function updateRowStatus(leadId: string, status: string) {
    setRows((current) =>
      current.map((row) => (row.leadId === leadId ? { ...row, status } : row)),
    );
    setSelected((current) =>
      current?.leadId === leadId ? { ...current, status } : current,
    );
  }

  function openRefillDialog(participant: RespondentTableRow) {
    setRefillReason("");
    setRefillAction({
      leadId: participant.leadId,
      fullName: participant.fullName,
      mobile: participant.mobile,
    });
  }

  async function handleRefillConfirm() {
    if (!refillAction) return;

    const reason = refillReason.trim();
    if (!reason) {
      toastError("A refill reason is required.");
      return;
    }

    const { leadId, fullName, mobile } = refillAction;
    setRefillUpdatingLeadId(leadId);
    const loadingId = toastLoading("Sending refill request...");

    try {
      const response = await fetch(
        `/api/admin/participants/${encodeURIComponent(leadId)}/refill-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to request refill.");
      }

      let copiedMessage = false;
      try {
        const refillUrl =
          typeof payload.refillUrl === "string" && payload.refillUrl.trim()
            ? payload.refillUrl.trim()
            : buildRefillLink(
                typeof payload.refillToken === "string"
                  ? payload.refillToken
                  : null,
              );
        const refillMessage = await getRenderedMessage(
          MESSAGE_TEMPLATE_KEYS.REFILL_REQUEST,
          {
            participant_name: fullName,
            mobile,
            lead_id: leadId,
            refill_link: refillUrl,
          },
        );
        if (refillMessage) {
          await navigator.clipboard.writeText(refillMessage);
          copiedMessage = true;
        }
      } catch {
        // Clipboard / template failure should not block the refill request.
      }

      dismissToast(loadingId);
      toastRefillRequestSent(copiedMessage);
      router.refresh();
    } catch (error) {
      dismissToast(loadingId);
      toastError(
        error instanceof Error ? error.message : "Failed to request refill.",
      );
    } finally {
      setRefillUpdatingLeadId(null);
      setRefillAction(null);
      setRefillReason("");
    }
  }

  function openEligibilityDialog(
    participant: RespondentTableRow,
    eligibility: "eligible" | "not_eligible",
  ) {
    setEligibilityReason("");
    setEligibilityAction({
      leadId: participant.leadId,
      fullName: participant.fullName,
      eligibility,
    });
  }

  async function handleEligibilityConfirm() {
    if (!eligibilityAction) return;

    const reason = eligibilityReason.trim();
    const { leadId, eligibility } = eligibilityAction;
    setEligibilityUpdatingLeadId(leadId);
    const loadingId = toastLoading("Updating eligibility...");

    try {
      const response = await fetch(
        `/api/admin/participants/${encodeURIComponent(leadId)}/eligibility`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eligibility, reason }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update eligibility.");
      }

      updateRowStatus(leadId, payload.status ?? eligibility);
      dismissToast(loadingId);
      toastEligibilityUpdated(eligibility);
      router.refresh();
    } catch (error) {
      dismissToast(loadingId);
      toastError(
        error instanceof Error
          ? error.message
          : "Failed to update eligibility.",
      );
    } finally {
      setEligibilityUpdatingLeadId(null);
      setEligibilityAction(null);
      setEligibilityReason("");
    }
  }

  async function handleQcUpdate(outcome: "pass" | "fail") {
    if (!selected) return;

    setQcUpdating(outcome);

    const loadingId = toastLoading("Updating status...");

    try {
      const response = await fetch(
        `/api/respondents/${encodeURIComponent(selected.leadId)}/qc`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update QC status.");
      }

      setSelected((current) =>
        current
          ? { ...current, status: payload.status ?? current.status }
          : current,
      );
      dismissToast(loadingId);
      toastSuccess("✅ Status Updated Successfully");
      router.refresh();
    } catch (error) {
      dismissToast(loadingId);
      toastError(
        error instanceof Error ? error.message : "Failed to update QC status.",
      );
    } finally {
      setQcUpdating(null);
    }
  }

  async function handleBulkSendMessage() {
    setBulkBusy(true);
    try {
      await postBulkLeadIds("/api/admin/bulk/message", bulk.selectedIdList);
      toastSuccess(
        `Message request queued for ${bulk.selectedCount.toLocaleString()} respondent(s).`,
      );
      bulk.clearSelection();
      setMessageConfirmOpen(false);
    } catch (error) {
      toastError(
        error instanceof Error ? error.message : "Failed to send messages.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkVerifyConfirm() {
    const reason = bulkVerifyReason.trim();
    if (!reason) {
      toastError("A verification reason is required.");
      return;
    }

    setBulkBusy(true);
    try {
      await runBulkActionWithToast({
        endpoint: "/api/admin/bulk/e-verify",
        leadIds: bulk.selectedIdList,
        extra: { reason },
        loadingMessage: "Verifying selected respondents...",
        successMessage: (count) => `Verified ${count} respondent(s).`,
        onSuccess: () => {
          const selected = new Set(bulk.selectedIdList);
          setRows((current) =>
            current.map((row) =>
              selected.has(row.leadId) ? { ...row, status: "eligible" } : row,
            ),
          );
          bulk.clearSelection();
          setVerifyConfirmOpen(false);
          setBulkVerifyReason("");
          router.refresh();
        },
      });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkRejectConfirm() {
    const reason = bulkRejectReason.trim();

    setBulkBusy(true);
    try {
      await runBulkActionWithToast({
        endpoint: "/api/admin/bulk/e-verify-reject",
        leadIds: bulk.selectedIdList,
        extra: { reason },
        loadingMessage: "Rejecting selected respondents...",
        successMessage: (count) => `Rejected ${count} respondent(s).`,
        onSuccess: () => {
          const selected = new Set(bulk.selectedIdList);
          setRows((current) =>
            current.map((row) =>
              selected.has(row.leadId)
                ? { ...row, status: "not_eligible" }
                : row,
            ),
          );
          bulk.clearSelection();
          setRejectConfirmOpen(false);
          setBulkRejectReason("");
          router.refresh();
        },
      });
    } finally {
      setBulkBusy(false);
    }
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
      const rows = await fetchScreenerExportRows(bulk.selectedIdList);
      if (format === "csv") {
        downloadCsv("screener-selected.csv", rows);
      } else {
        downloadExcel("screener-selected.xlsx", "Screener", rows);
      }
      dismissToast(loadingId);
      toastSuccess("Export ready.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Export failed.");
    }
  }

  const bulkActions: BulkAction[] = [
    ...(canVerify
      ? [
          {
            id: "verify",
            label: "Verify Selected",
            onClick: () => setVerifyConfirmOpen(true),
            disabled: bulkBusy,
          } satisfies BulkAction,
          {
            id: "reject-verification",
            label: "Reject Verification",
            onClick: () => setRejectConfirmOpen(true),
            disabled: bulkBusy,
          } satisfies BulkAction,
        ]
      : []),
    {
      id: "send-message",
      label: "Send Message",
      onClick: () => setMessageConfirmOpen(true),
      disabled: bulkBusy,
    },
    {
      id: "export-participants",
      label: "Export Selected",
      onClick: () => void handleExportParticipantsSelected(),
    },
    {
      id: "export-screener",
      label: "Export Screener",
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
              <TableHead>Channel</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Instagram ID</TableHead>
              <TableHead>Send</TableHead>
              <TableHead>DOB</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Termination Reason</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Ref. platform</TableHead>
              <TableHead> Screener Actions</TableHead>
              <TableHead>Screener</TableHead>
              <TableHead>Duplicate</TableHead>
              <TableHead>Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={19}
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
              pagination.pageItems.map((participant) => {
                const refillBusy = refillUpdatingLeadId === participant.leadId;
                const eligibilityBusy =
                  eligibilityUpdatingLeadId === participant.leadId;
                const canSetEligibility = canAdminSetEligibility(
                  participant.status,
                );

                return (
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
                      <span className="font-semibold">
                        {participant.fullName}
                      </span>
                      {participant.referralCode ? (
                        <div className="font-mono text-[11.5px] text-muted-foreground">
                          {participant.referralCode}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-[12.5px]">
                      {participant.mobile}
                    </TableCell>
                    <ParticipantMessageRowCells
                      leadId={participant.leadId}
                      participant={{
                        fullName: participant.fullName,
                        mobile: participant.mobile,
                        leadId: participant.leadId,
                        referralLink: buildReferralLink(
                          participant.referralCode,
                        ),
                        surveyUrl: participant.surveyUrl,
                        refillLink: participant.refillUrl,
                      }}
                      templates={templates}
                      templatesLoading={templatesLoading}
                      instagramId={participant.instagramId}
                      instagramVisibility={participant.instagramVisibility}
                      onInstagramIdSaved={(instagramId) =>
                        handleInstagramIdSaved(participant.leadId, instagramId)
                      }
                      onInstagramVisibilitySaved={(instagramVisibility) =>
                        handleInstagramVisibilitySaved(
                          participant.leadId,
                          instagramVisibility,
                        )
                      }
                    />
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
                        terminationReason={
                          participant.screenerTerminationReason
                        }
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
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="flex min-w-[180px] flex-col gap-2">
                        <EligibilityBadge status={participant.status} />
                        {canSetEligibility ? (
                          <div className="grid grid-cols-2 gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={
                                eligibilityBusy ||
                                participant.status === "eligible"
                              }
                              onClick={() =>
                                openEligibilityDialog(participant, "eligible")
                              }
                            >
                              Eligible
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={
                                eligibilityBusy ||
                                participant.status === "not_eligible"
                              }
                              onClick={() =>
                                openEligibilityDialog(
                                  participant,
                                  "not_eligible",
                                )
                              }
                            >
                              Not Eligible
                            </Button>
                          </div>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={
                            refillBusy || !canRequestRefill(participant.status)
                          }
                          onClick={() => openRefillDialog(participant)}
                        >
                          {refillBusy ? "Sending…" : "Request Refill"}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusPill
                        variant={participant.hasScreener ? "completed" : "lead"}
                      >
                        {participant.hasScreener ? "Submitted" : "Missing"}
                      </StatusPill>
                    </TableCell>
                    <TableCell>
                      <DuplicateStatusBadge row={participant} />
                    </TableCell>
                    <TableCell>{participant.createdAt}</TableCell>
                  </TableRow>
                );
              })
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

      <BulkConfirmDialog
        open={messageConfirmOpen}
        onOpenChange={setMessageConfirmOpen}
        title="Send message to selected respondents?"
        description={`Send message to ${bulk.selectedCount.toLocaleString()} respondent(s)?`}
        confirmLabel="Send"
        busy={bulkBusy}
        onConfirm={handleBulkSendMessage}
      />

      <Dialog open={verifyConfirmOpen} onOpenChange={setVerifyConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify selected respondents?</DialogTitle>
            <DialogDescription>
              Approve eligibility for {bulk.selectedCount.toLocaleString()}{" "}
              participant(s). A reason is required for the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label
              htmlFor="bulk-verify-reason"
              className="text-sm font-semibold text-plum-muted"
            >
              Reason
            </label>
            <textarea
              id="bulk-verify-reason"
              className="mt-2 min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={bulkVerifyReason}
              onChange={(event) => setBulkVerifyReason(event.target.value)}
              placeholder="e.g. Screener responses reviewed — approved for survey"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setVerifyConfirmOpen(false)}
              disabled={bulkBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleBulkVerifyConfirm()}
              disabled={bulkBusy}
            >
              {bulkBusy ? "Verifying…" : "Verify"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectConfirmOpen} onOpenChange={setRejectConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject verification for selected respondents?
            </DialogTitle>
            <DialogDescription>
              Mark {bulk.selectedCount.toLocaleString()} participant(s) as not
              eligible. A reason is optional.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label
              htmlFor="bulk-reject-reason"
              className="text-sm font-semibold text-plum-muted"
            >
              Reason — optional
            </label>
            <textarea
              id="bulk-reject-reason"
              className="mt-2 min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={bulkRejectReason}
              onChange={(event) => setBulkRejectReason(event.target.value)}
              placeholder="Optional — e.g. Failed eligibility review"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectConfirmOpen(false)}
              disabled={bulkBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleBulkRejectConfirm()}
              disabled={bulkBusy}
            >
              {bulkBusy ? "Rejecting…" : "Reject"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                    <span className="text-plum-muted">Screener</span>
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

                <SectionTitle>Verification</SectionTitle>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3 text-sm">
                    <span className="text-plum-muted">Verification status</span>
                    <VerificationStatusBadge
                      participantStatus={selected.status}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3 text-sm">
                    <span className="text-plum-muted">DM status</span>
                    <DmStatusBadge
                      participant={participantForDmBadge(selected)}
                    />
                  </div>
                  <div className="space-y-2 border-b border-dashed border-border pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-plum-muted">
                        Instagram Username
                      </span>
                      <InstagramVisibilityToggle
                        value={selected.instagramVisibility ?? "public"}
                        onChange={(next) =>
                          void handleDrawerVisibilityChange(
                            selected.leadId,
                            next,
                          )
                        }
                      />
                    </div>
                    <InstagramIdEditableCell
                      leadId={selected.leadId}
                      value={selected.instagramId}
                      onSaved={(instagramId) =>
                        handleInstagramIdSaved(selected.leadId, instagramId)
                      }
                    />
                  </div>
                  {selected.verificationMethod ? (
                    <DetailRow
                      label="Verification method"
                      value={selected.verificationMethod}
                    />
                  ) : null}
                  {selected.eligibilityOverrideReason ? (
                    <DetailRow
                      label="Override reason"
                      value={selected.eligibilityOverrideReason}
                    />
                  ) : null}
                  {selected.refillRequired || selected.refillReason ? (
                    <>
                      <DetailRow
                        label="Refill required"
                        value={selected.refillRequired ? "Yes" : "No"}
                      />
                      <DetailRow
                        label="Refill reason (admin only)"
                        value={selected.refillReason ?? "—"}
                      />
                    </>
                  ) : null}
                  <EligibilityBadge status={selected.status} />
                  {selected.status === "not_eligible" ? (
                    <p className="text-xs text-plum-muted">
                      Not-eligible reasons are recorded from registration
                      terminations (consent, gender, form rules). They can still
                      refer friends and earn rewards.
                    </p>
                  ) : null}
                  <p className="text-xs text-plum-muted">
                    Eligibility is assigned automatically from registration IP.
                    Admins can override with a reason — manual overrides are
                    preserved through refill until changed again.
                  </p>
                  {canAdminSetEligibility(selected.status) ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          eligibilityUpdatingLeadId === selected.leadId ||
                          selected.status === "eligible"
                        }
                        onClick={() =>
                          openEligibilityDialog(selected, "eligible")
                        }
                      >
                        Mark Eligible
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          eligibilityUpdatingLeadId === selected.leadId ||
                          selected.status === "not_eligible"
                        }
                        onClick={() =>
                          openEligibilityDialog(selected, "not_eligible")
                        }
                      >
                        Mark Not Eligible
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Eligibility is locked after survey submission.
                    </p>
                  )}
                  {selected.status === "not_eligible" ? (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="w-full"
                    >
                      <Link href="/terminations">View termination log</Link>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={
                      refillUpdatingLeadId === selected.leadId ||
                      !canRequestRefill(selected.status)
                    }
                    onClick={() => openRefillDialog(selected)}
                  >
                    {refillUpdatingLeadId === selected.leadId
                      ? "Sending…"
                      : "Request Refill"}
                  </Button>
                </div>

                <SectionTitle>Activity timeline</SectionTitle>
                <RespondentDrawerTimeline leadId={selected.leadId} />

                <SectionTitle>Actions</SectionTitle>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link
                    href={`/respondents/${encodeURIComponent(selected.leadId)}`}
                  >
                    View full record
                  </Link>
                </Button>

                <SectionTitle>Quality control</SectionTitle>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleQcUpdate("pass")}
                      disabled={
                        qcUpdating !== null || !canRunQc(selected.status)
                      }
                    >
                      {qcUpdating === "pass" ? "Saving..." : "Pass QC"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleQcUpdate("fail")}
                      disabled={
                        qcUpdating !== null || !canRunQc(selected.status)
                      }
                    >
                      {qcUpdating === "fail" ? "Saving..." : "Fail QC"}
                    </Button>
                  </div>
                  <p className="text-xs text-plum-muted">
                    QC is available after the participant completes the main
                    survey. Pass marks the referral reward as earned and moves
                    the participant to successful.
                  </p>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={refillAction !== null}
        onOpenChange={(open) => !open && setRefillAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registration Refill</DialogTitle>
            <DialogDescription>
              Ask {refillAction?.fullName ?? "this participant"} to resubmit
              their registration form. The reason is saved for admins only —
              the participant will not see it. Their screener answers will be
              cleared; phone number stays locked.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label
              htmlFor="refill-reason"
              className="text-sm font-semibold text-plum-muted"
            >
              Reason
            </label>
            <textarea
              id="refill-reason"
              className="mt-2 min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={refillReason}
              onChange={(event) => setRefillReason(event.target.value)}
              placeholder="Explain what needs to be updated..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRefillAction(null)}
              disabled={refillUpdatingLeadId !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleRefillConfirm()}
              disabled={refillUpdatingLeadId !== null}
            >
              {refillUpdatingLeadId !== null ? "Sending…" : "Send Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={eligibilityAction !== null}
        onOpenChange={(open) => !open && setEligibilityAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {eligibilityAction?.eligibility === "eligible"
                ? "Mark Eligible"
                : "Mark Not Eligible"}
            </DialogTitle>
            <DialogDescription>
              Set eligibility for{" "}
              {eligibilityAction?.fullName ?? "this participant"}. This
              overrides automatic IP-based eligibility until you change it
              again. A reason is optional.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label
              htmlFor="eligibility-reason"
              className="text-sm font-semibold text-plum-muted"
            >
              Reason — optional
            </label>
            <textarea
              id="eligibility-reason"
              className="mt-2 min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={eligibilityReason}
              onChange={(event) => setEligibilityReason(event.target.value)}
              placeholder="Optional — e.g. Verified household device — legitimate duplicate IP"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEligibilityAction(null)}
              disabled={eligibilityUpdatingLeadId !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleEligibilityConfirm()}
              disabled={eligibilityUpdatingLeadId !== null}
            >
              {eligibilityUpdatingLeadId !== null ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EligibilityBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === "eligible") {
    return <StatusPill variant="eligible">Eligible</StatusPill>;
  }
  if (normalized === "not_eligible") {
    return <StatusPill variant="notEligible">Not eligible</StatusPill>;
  }
  if (normalized === "paid") {
    return <StatusPill variant="success">Paid</StatusPill>;
  }
  return (
    <StatusPill variant="pending">{status.replaceAll("_", " ")}</StatusPill>
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
