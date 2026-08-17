"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";

import {
  BulkActionToolbar,
  SelectAllFilteredBanner,
  SelectableRowCheckboxCell,
  TableCheckbox,
  TablePagination,
  type BulkAction,
} from "@/components/admin/bulk-selection";
import { adminPath } from "@/lib/admin-paths";
import { DuplicateStatusBadge } from "@/components/admin/duplicate-status-badge";
import { GridExportButtons } from "@/components/admin/grid-export-buttons";
import { PayoutUpiEditor } from "@/components/admin/payout-upi-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  downloadRazorpayPayoutCsv,
  downloadRazorpayPayoutExcel,
} from "@/lib/export";
import {
  buildPayoutExportRows,
  type PayoutExportSourceRow,
} from "@/lib/payout-export";
import { formatAdminDate } from "@/lib/format-admin-datetime";
import {
  formatDuplicateStatusLabel,
  isAnyDuplicate,
} from "@/lib/respondents/duplicate-visibility";
import { toastError, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";

type PayoutApiRow = {
  leadId: string;
  fullName: string;
  mobile: string;
  email: string | null;
  city: string | null;
  referralCode: string;
  referralEarnings: number;
  surveyEarnings: number;
  totalAmount: number;
  paymentStatus: "pending" | "ready" | "paid";
  paymentDate: string | null;
  upiId: string | null;
  surveyName: string;
  referralsName: string;
  payoutReferenceId: string | null;
  qcStatus: string;
  isFlaggedDuplicate: boolean;
  duplicateFlag: boolean;
  duplicateReason: string | null;
  ipAddress: string | null;
  originalParticipantLeadId: string | null;
  ipAssociatedLeadIds: string[];
  createdAt: string | null;
};

type PayoutMode = "referral" | "survey";

type SortBy =
  | "leadId"
  | "fullName"
  | "totalAmount"
  | "paymentStatus"
  | "paymentDate";

/** Survey-completion / QC outcomes — excludes terminated & pre-survey statuses. */
const SURVEY_PAYOUT_STATUSES = new Set([
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
]);

function amountForMode(row: PayoutApiRow, mode: PayoutMode) {
  return mode === "referral" ? row.referralEarnings : row.surveyEarnings;
}

function matchesPayoutMode(row: PayoutApiRow, mode: PayoutMode) {
  if (mode === "referral") {
    // Referral view keeps the full roster (incl. terminated referrers).
    return true;
  }
  return SURVEY_PAYOUT_STATUSES.has(row.qcStatus.toLowerCase());
}

function paymentVariant(status: string): StatusPillVariant {
  if (status === "paid") return "success";
  if (status === "ready") return "review";
  return "pending";
}

function qcVariant(status: string): StatusPillVariant {
  const normalized = status.toLowerCase();
  if (normalized.includes("pass")) return "success";
  if (normalized.includes("fail")) return "fail";
  if (normalized === "terminated") return "notEligible";
  if (normalized === "completed") return "completed";
  if (normalized === "successful" || normalized === "paid") return "success";
  return "lead";
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return formatAdminDate(value);
}

function matchesSearch(row: PayoutApiRow, search: string): boolean {
  const needle = search.toLowerCase();
  return (
    row.leadId.toLowerCase().includes(needle) ||
    row.fullName.toLowerCase().includes(needle) ||
    row.mobile.includes(needle) ||
    row.referralCode.toLowerCase().includes(needle) ||
    (row.ipAddress ?? "").toLowerCase().includes(needle)
  );
}

function compareRows(
  a: PayoutApiRow,
  b: PayoutApiRow,
  sortBy: SortBy,
  sortDir: "asc" | "desc",
  mode: PayoutMode,
): number {
  let cmp = 0;
  switch (sortBy) {
    case "fullName":
      cmp = a.fullName.localeCompare(b.fullName);
      break;
    case "totalAmount":
      cmp = amountForMode(a, mode) - amountForMode(b, mode);
      break;
    case "paymentStatus":
      cmp = a.paymentStatus.localeCompare(b.paymentStatus);
      break;
    case "paymentDate": {
      const aTime = a.paymentDate ? new Date(a.paymentDate).getTime() : 0;
      const bTime = b.paymentDate ? new Date(b.paymentDate).getTime() : 0;
      cmp = aTime - bTime;
      break;
    }
    default:
      cmp = a.leadId.localeCompare(b.leadId);
  }
  return sortDir === "asc" ? cmp : -cmp;
}

function toRazorpaySourceRows(
  rows: PayoutApiRow[],
  mode: PayoutMode,
): PayoutExportSourceRow[] {
  return rows.map((row) => ({
    leadId: row.leadId,
    fullName: row.fullName,
    mobile: row.mobile,
    email: row.email,
    upiId: row.upiId,
    amount: amountForMode(row, mode),
    surveyName: row.surveyName,
    referralsName: row.referralsName,
    payoutReferenceId: row.payoutReferenceId,
  }));
}

export function PayoutsTable() {
  const [mode, setMode] = useState<PayoutMode>("referral");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "pending" | "ready" | "paid">(
    "all",
  );
  const [sortBy, setSortBy] = useState<SortBy>("leadId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [rows, setRows] = useState<PayoutApiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PayoutApiRow | null>(null);

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "10000",
        sortBy: "leadId",
        sortDir: "desc",
      });
      const response = await fetch(`/api/admin/payouts?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load payouts.");
      }
      setRows((payload.rows ?? []) as PayoutApiRow[]);
    } catch (fetchError) {
      toastError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load payouts.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayouts();
  }, [loadPayouts]);

  const modeCounts = useMemo(
    () => ({
      referral: rows.filter((row) => matchesPayoutMode(row, "referral")).length,
      survey: rows.filter((row) => matchesPayoutMode(row, "survey")).length,
    }),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const needle = search.trim();
    let next = rows.filter((row) => matchesPayoutMode(row, mode));
    if (needle) {
      next = next.filter((row) => matchesSearch(row, needle));
    }
    if (status !== "all") {
      next = next.filter((row) => row.paymentStatus === status);
    }
    return [...next].sort((a, b) =>
      compareRows(a, b, sortBy, sortDir, mode),
    );
  }, [mode, rows, search, sortBy, sortDir, status]);

  const {
    bulk,
    pagination,
    filteredIds,
    pageIds,
    headerCheckboxState,
    showSelectAllFilteredBanner,
  } = useBulkTableState(filteredRows);

  const { resetPage } = pagination;
  const { clearSelection } = bulk;

  useEffect(() => {
    resetPage();
  }, [mode, search, status, sortBy, sortDir, resetPage]);

  useEffect(() => {
    clearSelection();
  }, [mode, clearSelection]);

  function exportRazorpayPayoutFile(format: "csv" | "xlsx") {
    const candidates =
      bulk.selectedIdList.length > 0
        ? filteredRows.filter((row) =>
            bulk.selectedIdList.includes(row.leadId),
          )
        : filteredRows;

    if (candidates.length === 0) {
      toastError("Nothing to export.");
      return;
    }

    const { rows: payoutRows, summary } = buildPayoutExportRows(
      toRazorpaySourceRows(candidates, mode),
    );
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "xlsx") {
      downloadRazorpayPayoutExcel({
        filename: `razorpayx-upi-payout-${mode}-${stamp}.xlsx`,
        payoutRows,
      });
    } else {
      downloadRazorpayPayoutCsv({
        filename: `razorpayx-upi-payout-${mode}-${stamp}.csv`,
        payoutRows,
      });
    }

    const parts = [`${summary.total} row(s) exported`];
    if (summary.ready > 0) {
      parts.push(`${summary.ready} ready for payout`);
    }
    if (summary.missingUpi > 0) {
      parts.push(`${summary.missingUpi} missing UPI`);
    }
    if (summary.invalidUpi > 0) {
      parts.push(`${summary.invalidUpi} invalid UPI`);
    }
    if (summary.invalidAmount > 0) {
      parts.push(`${summary.invalidAmount} invalid amount`);
    }
    if (summary.invalidName > 0) {
      parts.push(`${summary.invalidName} invalid name`);
    }
    toastSuccess(`Export Payout File: ${parts.join("; ")}.`);
  }

  function updateRowUpi(leadId: string, upiId: string | null) {
    setRows((current) =>
      current.map((row) => (row.leadId === leadId ? { ...row, upiId } : row)),
    );
    setSelected((current) =>
      current?.leadId === leadId ? { ...current, upiId } : current,
    );
  }

  const bulkActions: BulkAction[] = [
    {
      id: "export-payout-xlsx",
      label: "Export Payout Excel",
      onClick: () => exportRazorpayPayoutFile("xlsx"),
    },
    {
      id: "export-payout-csv",
      label: "Export Payout CSV",
      onClick: () => exportRazorpayPayoutFile("csv"),
    },
    {
      id: "bulk-payout",
      label: "Bulk payout",
      onClick: () => undefined,
      disabled: true,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Payout type</p>
          <p className="mt-0.5 text-xs text-plum-muted">
            Referral lists everyone (incl. terminated referrers). Survey lists
            only people who completed the form / QC path.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Payout type"
          className="inline-flex rounded-[12px] border border-border bg-rose-tint/40 p-1"
        >
          {(
            [
              {
                id: "referral" as const,
                label: "Referral",
                count: modeCounts.referral,
              },
              {
                id: "survey" as const,
                label: "Survey",
                count: modeCounts.survey,
              },
            ] as const
          ).map((item) => {
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(item.id)}
                className={cn(
                  "rounded-[10px] px-4 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-plum-muted hover:text-foreground",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "ml-2 font-mono text-xs tabular-nums",
                    active ? "text-primary" : "text-plum-faint",
                  )}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Search
          </label>
          <Input
            placeholder="Lead ID, name, mobile, referral code, IP…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Payment status
          </label>
          <Select
            className="w-[160px]"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as typeof status)
            }
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="ready">Ready</option>
            <option value="paid">Paid</option>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Sort by
          </label>
          <Select
            className="w-[160px]"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortBy)}
          >
            <option value="leadId">Lead ID</option>
            <option value="fullName">Name</option>
            <option value="totalAmount">
              {mode === "referral" ? "Referral amount" : "Survey amount"}
            </option>
            <option value="paymentStatus">Payment status</option>
            <option value="paymentDate">Payment date</option>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Order
          </label>
          <Select
            className="w-[120px]"
            value={sortDir}
            onChange={(event) =>
              setSortDir(event.target.value as typeof sortDir)
            }
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GridExportButtons
            disabled={loading || filteredRows.length === 0}
            onExportCsv={async () => {
              exportRazorpayPayoutFile("csv");
            }}
            onExportExcel={async () => {
              exportRazorpayPayoutFile("xlsx");
            }}
          />
          <Button type="button" variant="outline" disabled title="Coming soon">
            Bulk payout
          </Button>
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
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pr-0">
                <TableCheckbox
                  checked={headerCheckboxState === "checked"}
                  indeterminate={headerCheckboxState === "indeterminate"}
                  ariaLabel="Select all rows on this page"
                  disabled={loading || pageIds.length === 0}
                  onChange={() => bulk.toggleAllCurrentPage(pageIds)}
                />
              </TableHead>
              <TableHead>Lead ID</TableHead>
              <TableHead>Participant</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>
                {mode === "referral" ? "Referral" : "Survey"}
              </TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>UPI</TableHead>
              <TableHead>QC</TableHead>
              <TableHead>Duplicate IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-8 text-center text-muted-foreground"
                >
                  Loading payouts…
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-8 text-center text-muted-foreground"
                >
                  {mode === "referral"
                    ? "No payout rows match your filters."
                    : "No survey completers match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              pagination.pageItems.map((row) => (
                <TableRow
                  key={row.leadId}
                  className="cursor-pointer"
                  onClick={() => setSelected(row)}
                >
                  <SelectableRowCheckboxCell
                    leadId={row.leadId}
                    nameLabel={row.fullName}
                    checked={bulk.isSelected(row.leadId)}
                    onToggle={bulk.toggleSelection}
                  />
                  <TableCell className="font-mono text-[11.5px]">
                    <Link
                      href={adminPath(`/respondents/${encodeURIComponent(row.leadId)}`)}
                      className="text-primary hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.leadId}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{row.fullName}</TableCell>
                  <TableCell className="font-mono text-[12px]">
                    {row.mobile}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatCurrency(amountForMode(row, mode))}
                  </TableCell>
                  <TableCell>
                    <StatusPill variant={paymentVariant(row.paymentStatus)}>
                      {row.paymentStatus}
                    </StatusPill>
                  </TableCell>
                  <TableCell>{formatDate(row.paymentDate)}</TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <PayoutUpiEditor
                      leadId={row.leadId}
                      upiId={row.upiId}
                      onSaved={(upiId) => updateRowUpi(row.leadId, upiId)}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusPill variant={qcVariant(row.qcStatus)}>
                      {row.qcStatus}
                    </StatusPill>
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <DuplicateStatusBadge
                      row={row}
                      ipAssociatedLeadIds={row.ipAssociatedLeadIds}
                    />
                  </TableCell>
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
                    {formatDuplicateStatusLabel(selected)}
                    {selected.ipAddress ? (
                      <>
                        {" "}
                        · IP{" "}
                        <span className="font-mono">{selected.ipAddress}</span>
                      </>
                    ) : null}
                    . Review before payout.
                  </div>
                ) : null}

                <SectionTitle>Payout</SectionTitle>
                <DetailRow
                  label="Referral earnings"
                  value={formatCurrency(selected.referralEarnings)}
                />
                <DetailRow
                  label="Survey earnings"
                  value={formatCurrency(selected.surveyEarnings)}
                />
                <DetailRow
                  label="Total"
                  value={formatCurrency(selected.totalAmount)}
                />
                <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3 text-sm">
                  <span className="text-plum-muted">Payment status</span>
                  <StatusPill variant={paymentVariant(selected.paymentStatus)}>
                    {selected.paymentStatus}
                  </StatusPill>
                </div>
                <DetailRow
                  label="Payment date"
                  value={formatDate(selected.paymentDate)}
                />
                <div className="flex items-center justify-between gap-4 border-b border-dashed border-border py-2.5 text-sm">
                  <span className="shrink-0 text-plum-muted">UPI</span>
                  <PayoutUpiEditor
                    leadId={selected.leadId}
                    upiId={selected.upiId}
                    variant="drawer"
                    onSaved={(upiId) =>
                      updateRowUpi(selected.leadId, upiId)
                    }
                  />
                </div>

                <SectionTitle>Participant</SectionTitle>
                <DetailRow label="Lead ID" value={selected.leadId} mono />
                <DetailRow
                  label="Referral code"
                  value={selected.referralCode}
                  mono
                />
                <DetailRow label="Mobile" value={selected.mobile} mono />
                <DetailRow label="City" value={selected.city ?? "—"} />
                <DetailRow
                  label="Registered"
                  value={formatDate(selected.createdAt)}
                />
                <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3 text-sm">
                  <span className="text-plum-muted">QC / status</span>
                  <StatusPill variant={qcVariant(selected.qcStatus)}>
                    {selected.qcStatus}
                  </StatusPill>
                </div>

                <SectionTitle>Duplicate IP</SectionTitle>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3 text-sm">
                    <span className="text-plum-muted">Duplicate status</span>
                    <DuplicateStatusBadge
                      row={selected}
                      ipAssociatedLeadIds={selected.ipAssociatedLeadIds}
                    />
                  </div>
                  <DetailRow
                    label="Match type"
                    value={formatDuplicateStatusLabel(selected)}
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
                  {selected.isFlaggedDuplicate ? (
                    <DetailRow
                      label="Leads on this IP"
                      value={
                        selected.ipAssociatedLeadIds.length > 0
                          ? selected.ipAssociatedLeadIds.join(", ")
                          : "—"
                      }
                      mono
                    />
                  ) : null}
                  <DetailRow
                    label="IP duplicate flag"
                    value={selected.isFlaggedDuplicate ? "Yes" : "No"}
                  />
                  <DetailRow
                    label="Fingerprint flag"
                    value={selected.duplicateFlag ? "Yes" : "No"}
                  />
                  <DetailRow
                    label="Duplicate reason"
                    value={selected.duplicateReason ?? "—"}
                  />
                </div>

                <div className="mt-6">
                  <Button asChild variant="outline" className="w-full">
                    <Link
                      href={adminPath(`/respondents/${encodeURIComponent(selected.leadId)}`)}
                    >
                      Open full respondent record
                    </Link>
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
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
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-border py-2.5 text-sm">
      <span className="shrink-0 text-plum-muted">{label}</span>
      <span
        className={
          mono
            ? "max-w-[60%] break-all text-right font-mono text-xs text-foreground"
            : "max-w-[60%] text-right text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
