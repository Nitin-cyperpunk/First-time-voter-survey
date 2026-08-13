"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, SearchIcon } from "lucide-react";

import { CallDispositionsSettings } from "@/components/admin/call-dispositions-settings";
import { CallOutcomeDialog } from "@/components/admin/call-outcome-dialog";
import {
  BulkActionToolbar,
  BulkConfirmDialog,
  SelectAllFilteredBanner,
  SelectableRowCheckboxCell,
  TableCheckbox,
  TablePagination,
  type BulkAction,
} from "@/components/admin/bulk-selection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ParticipantMessageRowCells } from "@/features/message-templates/components/participant-message-row-cells";
import { useAdminMessageTemplates } from "@/features/message-templates/hooks/use-admin-message-templates";
import { loadParticipantMessagePrefs } from "@/features/message-templates/lib/participant-message-prefs";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import { getRenderedMessage } from "@/lib/message-templates/client";
import type { CallDispositionsConfig } from "@/lib/call-dispositions/types";
import { dispositionContradictsVerified } from "@/lib/call-dispositions/defaults";
import {
  DM_STATUS_LABELS,
  type DmStatus,
  dmStatusVariant,
} from "@/lib/dm-verify";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastRefillRequestSent,
  toastSuccess,
  toastSurveyLinkCopied,
} from "@/lib/toast";
import type { DmVerifyAction } from "@/server/services/dm-verify.service";
import { useBulkTableState } from "@/hooks/use-bulk-table-state";
import { runBulkActionWithToast } from "@/lib/bulk-selection/bulk-actions-client";
import {
  exportParticipantRows,
  rowsToParticipantExport,
} from "@/lib/bulk-selection/participant-export";

export type DmVerifyRow = {
  leadId: string;
  fullName: string;
  mobile: string;
  status: string;
  createdAt: string;
  dmStatus: DmStatus;
  verifiedAt: string | null;
  surveyAccessGranted: boolean;
  surveyUrl: string | null;
  refillUrl: string | null;
  instagramId: string | null;
  instagramVisibility: "public" | "private";
  callDisposition: string | null;
  callDispositionLabel: string | null;
  callDispositionNotes: string | null;
  callDispositionAt: string | null;
};

type DmVerifyTableProps = {
  participants: DmVerifyRow[];
  dispositionsConfig: CallDispositionsConfig;
};

type RefillAction = {
  leadId: string;
  fullName: string;
  mobile: string;
};

const DM_FILTERS: Array<DmStatus | "all"> = [
  "all",
  "waiting_for_dm",
  "message_received",
  "call_pending",
  "verified",
  "survey_link_sent",
  "completed",
];

function canRequestRefill(status: string) {
  return status !== "paid";
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
  if (normalized === "under_review") {
    return <StatusPill variant="review">under review</StatusPill>;
  }
  return (
    <StatusPill variant="pending">{status.replaceAll("_", " ")}</StatusPill>
  );
}

export function DmVerifyTable({
  participants: initial,
  dispositionsConfig,
}: DmVerifyTableProps) {
  const router = useRouter();
  const { templates, loading: templatesLoading } = useAdminMessageTemplates();
  const [rows, setRows] = useState(initial);
  const [config, setConfig] = useState(dispositionsConfig);
  const [search, setSearch] = useState("");
  const [dmFilter, setDmFilter] = useState<DmStatus | "all">("all");
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [outcomeRow, setOutcomeRow] = useState<DmVerifyRow | null>(null);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [verifyConfirmOpen, setVerifyConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refillAction, setRefillAction] = useState<RefillAction | null>(null);
  const [refillReason, setRefillReason] = useState("");
  const [refillUpdatingLeadId, setRefillUpdatingLeadId] = useState<
    string | null
  >(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (dmFilter !== "all" && row.dmStatus !== dmFilter) return false;
      if (!query) return true;
      const instagramQuery = query.replace(/^@/, "");
      return (
        row.fullName.toLowerCase().includes(query) ||
        row.mobile.includes(query) ||
        row.leadId.toLowerCase().includes(query) ||
        (row.instagramId ?? "").toLowerCase().includes(instagramQuery) ||
        (row.callDispositionLabel ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, search, dmFilter]);

  const {
    bulk,
    pagination,
    filteredIds,
    pageIds,
    headerCheckboxState,
    showSelectAllFilteredBanner,
  } = useBulkTableState(filtered);

  useEffect(() => {
    pagination.setPage(1);
  }, [search, dmFilter, pagination.setPage]);

  function openOutcomeDialog(row: DmVerifyRow) {
    setOutcomeRow(row);
    setOutcomeOpen(true);
  }

  function handleInstagramIdSaved(leadId: string, instagramId: string | null) {
    setRows((current) =>
      current.map((row) =>
        row.leadId === leadId ? { ...row, instagramId } : row,
      ),
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
  }

  function handleDmStatusUpdated(leadId: string, dmStatus: DmStatus) {
    setRows((current) =>
      current.map((row) =>
        row.leadId === leadId ? { ...row, dmStatus } : row,
      ),
    );
  }

  async function runAction(
    row: DmVerifyRow,
    action: DmVerifyAction,
    extra?: { dispositionKey?: string; notes?: string },
  ) {
    setBusyLeadId(row.leadId);
    const loadingId = toastLoading(
      action === "generate_survey_token"
        ? "Granting survey access..."
        : action === "set_call_disposition"
          ? "Recording call outcome..."
          : "Updating...",
    );

    try {
      const response = await fetch("/api/admin/dm-verify", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: row.leadId,
          action,
          dispositionKey: extra?.dispositionKey,
          notes: extra?.notes,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "Action failed.");
      }

      const surveyUrl = (payload.surveyUrl as string | null) ?? row.surveyUrl;

      if (action === "generate_survey_token" && surveyUrl) {
        const prefs = loadParticipantMessagePrefs(row.leadId);
        const templateKey =
          prefs.last_template_used ?? MESSAGE_TEMPLATE_KEYS.SURVEY_INVITATION;
        const invitationMessage = await getRenderedMessage(templateKey, {
          participant_name: row.fullName,
          survey_link: surveyUrl,
          mobile: row.mobile,
          lead_id: row.leadId,
        });
        await navigator.clipboard.writeText(invitationMessage || surveyUrl);
      }

      // Status-only Not Eligible: keep the row on DM & Verify (main-survey
      // terminal decision). Do not drop them from this queue / “send back”
      // to the Respondents screener workflow.
      setRows((current) =>
        current.map((item) =>
          item.leadId === row.leadId
            ? {
                ...item,
                dmStatus: (payload.dmStatus as DmStatus) ?? item.dmStatus,
                status: (payload.status as string) ?? item.status,
                surveyUrl,
                surveyAccessGranted:
                  action === "generate_survey_token"
                    ? true
                    : item.surveyAccessGranted,
                verifiedAt:
                  (payload.verifiedAt as string | null) ?? item.verifiedAt,
                callDisposition:
                  (payload.callDisposition as string | null) ??
                  item.callDisposition,
                callDispositionLabel:
                  (payload.callDispositionLabel as string | null) ??
                  item.callDispositionLabel,
                callDispositionNotes:
                  (payload.callDispositionNotes as string | null) ??
                  item.callDispositionNotes,
                callDispositionAt:
                  (payload.callDispositionAt as string | null) ??
                  item.callDispositionAt,
              }
            : item,
        ),
      );

      dismissToast(loadingId);
      if (action === "generate_survey_token") {
        toastSurveyLinkCopied();
      } else if (action === "set_call_disposition") {
        toastSuccess(
          payload.status === "not_eligible"
            ? "Outcome recorded. Participant marked not eligible."
            : "Call outcome recorded.",
        );
        setOutcomeOpen(false);
        setOutcomeRow(null);
      } else {
        toastSuccess("Updated successfully.");
      }
      router.refresh();
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusyLeadId(null);
    }
  }

  async function submitCallOutcome(input: {
    dispositionKey: string;
    notes: string;
  }) {
    if (!outcomeRow) return;
    await runAction(outcomeRow, "set_call_disposition", input);
  }

  async function copySurveyLink(row: DmVerifyRow) {
    if (!row.surveyAccessGranted) {
      toastError(
        "Please Grant Survey first, then you can copy the survey link.",
      );
      return;
    }
    if (!row.surveyUrl) {
      toastError(
        "Please Grant Survey first, then you can copy the survey link.",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(row.surveyUrl);
      toastSurveyLinkCopied();
    } catch {
      toastError("Could not copy survey link.");
    }
  }

  function openRefillDialog(row: DmVerifyRow) {
    if (!row.surveyAccessGranted) {
      toastError(
        "Please Grant Survey first, then you can request a refill.",
      );
      return;
    }
    setRefillReason("");
    setRefillAction({
      leadId: row.leadId,
      fullName: row.fullName,
      mobile: row.mobile,
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
    const loadingId = toastLoading("Sending survey refill request...");

    try {
      const response = await fetch(
        `/api/admin/participants/${encodeURIComponent(leadId)}/survey-refill-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to request survey refill.");
      }

      let copiedMessage = false;
      try {
        const surveyUrl =
          typeof payload.surveyUrl === "string" && payload.surveyUrl.trim()
            ? payload.surveyUrl.trim()
            : "";
        const refillMessage = await getRenderedMessage(
          MESSAGE_TEMPLATE_KEYS.REFILL_REQUEST,
          {
            participant_name: fullName,
            mobile,
            lead_id: leadId,
            // Survey refill must open /survey?t=..., never the screener /refill link.
            survey_refill_link: surveyUrl,
            survey_link: surveyUrl,
            // Backward compat for templates that still use {{refill_link}}.
            refill_link: surveyUrl,
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
        error instanceof Error ? error.message : "Failed to request survey refill.",
      );
    } finally {
      setRefillUpdatingLeadId(null);
      setRefillAction(null);
      setRefillReason("");
    }
  }

  async function handleBulkVerify() {
    setBulkBusy(true);
    try {
      await runBulkActionWithToast({
        endpoint: "/api/admin/bulk/verify",
        leadIds: bulk.selectedIdList,
        loadingMessage: "Verifying participants...",
        successMessage: (count) => `Verified ${count} participant(s).`,
        onSuccess: () => {
          bulk.clearSelection();
          setVerifyConfirmOpen(false);
          router.refresh();
        },
      });
    } finally {
      setBulkBusy(false);
    }
  }

  function handleExportSelected() {
    const selectedRows = filtered.filter((row) =>
      bulk.selectedIds.has(row.leadId),
    );
    exportParticipantRows(
      rowsToParticipantExport(
        selectedRows.map((row) => ({
          ...row,
          city: null,
          createdAt: row.createdAt,
        })),
      ),
      "dm-verify-selected.csv",
    );
  }

  const bulkActions: BulkAction[] = [
    {
      id: "verify",
      label: "Verify",
      onClick: () => setVerifyConfirmOpen(true),
      disabled: bulkBusy,
    },
    {
      id: "export",
      label: "Export",
      onClick: handleExportSelected,
    },
  ];

  return (
    <div className="space-y-4 pb-24">
      <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-foreground">
          DM &amp; Verify
        </h2>
        <p className="mt-1 text-sm text-plum-muted">
          Verify eligible participants via Instagram DM, record call outcomes,
          then grant survey access here.
        </p>

        <div className="mt-4 space-y-3">
          <div className="relative min-w-0">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, mobile, lead ID, Instagram ID, or disposition..."
              className="pl-9"
            />
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {DM_FILTERS.map((filter) => (
              <Button
                key={filter}
                type="button"
                size="sm"
                className="shrink-0"
                variant={dmFilter === filter ? "default" : "outline"}
                onClick={() => setDmFilter(filter)}
              >
                {filter === "all" ? "All" : DM_STATUS_LABELS[filter]}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <CallDispositionsSettings initialConfig={config} onSaved={setConfig} />

      <CallOutcomeDialog
        open={outcomeOpen}
        onOpenChange={setOutcomeOpen}
        row={outcomeRow}
        config={config}
        busy={busyLeadId === outcomeRow?.leadId}
        onSubmit={submitCallOutcome}
      />

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
              <TableHead className="min-w-[120px]">Name</TableHead>
              <TableHead className="min-w-[100px]">Lead ID</TableHead>
              <TableHead className="min-w-[100px]">Mobile</TableHead>
              <TableHead className="min-w-[108px]">Channel</TableHead>
              <TableHead className="min-w-[128px]">Template</TableHead>
              <TableHead className="min-w-[120px]">Instagram ID</TableHead>
              <TableHead className="min-w-[88px]">Send</TableHead>
              <TableHead className="min-w-[80px]">Status</TableHead>
              <TableHead className="min-w-[120px]">DM Status</TableHead>
              <TableHead className="min-w-[140px]">Call outcome</TableHead>
              <TableHead className="min-w-[80px]">Verified</TableHead>
              <TableHead className="min-w-[200px]">Survey Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={13}
                  className="py-10 text-center text-sm text-plum-muted"
                >
                  No participants match your filters.
                </TableCell>
              </TableRow>
            ) : (
              pagination.pageItems.map((row) => {
                const busy = busyLeadId === row.leadId;
                const verified = Boolean(row.verifiedAt);

                return (
                  <TableRow key={row.leadId}>
                    <SelectableRowCheckboxCell
                      leadId={row.leadId}
                      nameLabel={row.fullName}
                      checked={bulk.isSelected(row.leadId)}
                      onToggle={bulk.toggleSelection}
                    />
                    <TableCell className="font-medium">
                      {row.fullName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.leadId}
                    </TableCell>
                    <TableCell>{row.mobile}</TableCell>
                    <ParticipantMessageRowCells
                      leadId={row.leadId}
                      participant={{
                        fullName: row.fullName,
                        mobile: row.mobile,
                        leadId: row.leadId,
                        surveyUrl: row.surveyUrl,
                        refillLink: row.refillUrl,
                      }}
                      templates={templates}
                      templatesLoading={templatesLoading}
                      surveyUrl={row.surveyUrl}
                      instagramId={row.instagramId}
                      instagramVisibility={row.instagramVisibility}
                      onInstagramIdSaved={(instagramId) =>
                        handleInstagramIdSaved(row.leadId, instagramId)
                      }
                      onInstagramVisibilitySaved={(instagramVisibility) =>
                        handleInstagramVisibilitySaved(
                          row.leadId,
                          instagramVisibility,
                        )
                      }
                      onDmStatusUpdated={(dmStatus) =>
                        handleDmStatusUpdated(row.leadId, dmStatus)
                      }
                    />
                    <TableCell className="align-middle capitalize">
                      {row.status.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="align-middle">
                      <Badge variant={dmStatusVariant(row.dmStatus)}>
                        {DM_STATUS_LABELS[row.dmStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={
                        verified &&
                        row.callDisposition &&
                        dispositionContradictsVerified(row.callDisposition)
                          ? "align-middle cursor-pointer opacity-60"
                          : "align-middle cursor-pointer"
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        openOutcomeDialog(row);
                      }}
                    >
                      {row.callDispositionLabel ? (
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-foreground">
                            {row.callDispositionLabel}
                          </p>
                          {row.callDispositionNotes ? (
                            <p
                              className="line-clamp-2 text-xs text-plum-muted"
                              title={row.callDispositionNotes}
                            >
                              {row.callDispositionNotes}
                            </p>
                          ) : null}
                          {verified &&
                          row.callDisposition &&
                          dispositionContradictsVerified(
                            row.callDisposition,
                          ) ? (
                            <p className="text-[11px] text-plum-faint">
                              Conflicts with Verified — click to correct
                            </p>
                          ) : (
                            <p className="text-[11px] text-plum-muted">
                              Click to edit
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-plum-muted underline-offset-2 hover:underline">
                          Record call
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="align-middle">
                      {verified ? (
                        <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
                          <CheckCircle2Icon className="size-4" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-sm text-plum-muted">No</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="align-middle"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex w-[200px] flex-col gap-1.5">
                        <EligibilityBadge status={row.status} />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-full justify-center px-2 text-xs font-medium"
                          disabled={busy}
                          onClick={() =>
                            void runAction(row, "generate_survey_token")
                          }
                        >
                          Grant Survey
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={
                            row.surveyAccessGranted
                              ? "h-8 w-full justify-center px-2 text-xs font-medium"
                              : "h-8 w-full justify-center px-2 text-xs font-medium opacity-40 text-plum-faint border-rose-tint"
                          }
                          disabled={busy}
                          aria-disabled={!row.surveyAccessGranted}
                          onClick={() => void copySurveyLink(row)}
                        >
                          Copy Survey Link
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={
                            row.surveyAccessGranted &&
                            canRequestRefill(row.status)
                              ? "h-8 w-full justify-center px-2 text-xs font-medium"
                              : "h-8 w-full justify-center px-2 text-xs font-medium opacity-40 text-plum-faint border-rose-tint"
                          }
                          disabled={
                            busy || refillUpdatingLeadId === row.leadId
                          }
                          aria-disabled={
                            !row.surveyAccessGranted ||
                            !canRequestRefill(row.status)
                          }
                          onClick={() => {
                            if (!canRequestRefill(row.status)) return;
                            openRefillDialog(row);
                          }}
                        >
                          {refillUpdatingLeadId === row.leadId
                            ? "Sending…"
                            : "Request Refill"}
                        </Button>
                      </div>
                    </TableCell>
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
        open={verifyConfirmOpen}
        onOpenChange={setVerifyConfirmOpen}
        title="Verify selected participants?"
        description={`Verify ${bulk.selectedCount.toLocaleString()} participant(s)?`}
        confirmLabel="Verify"
        busy={bulkBusy}
        onConfirm={handleBulkVerify}
      />

      <Dialog
        open={refillAction !== null}
        onOpenChange={(open) => !open && setRefillAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Survey Refill</DialogTitle>
            <DialogDescription>
              Ask {refillAction?.fullName ?? "this participant"} to reopen the
              main survey. A fresh unique survey link will be generated and
              copied for you to send. The reason is saved for admins only — the
              participant will not see it.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label
              htmlFor="dm-verify-refill-reason"
              className="text-sm font-semibold text-plum-muted"
            >
              Reason
            </label>
            <textarea
              id="dm-verify-refill-reason"
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
    </div>
  );
}
