"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  PAYOUT_DUPLICATE_FILTER_OPTIONS,
  formatDuplicateStatusLabel,
  isAnyDuplicate,
  payoutDuplicateFilterLabel,
  type PayoutDuplicateFilter,
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
  referralTotalCount: number;
  referralEarnedCount: number;
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
  duplicateClusterId: string | null;
  isFingerprintClusterOriginal: boolean;
  duplicateGamingPattern: string | null;
  ipAssociatedLeadIds: string[];
  createdAt: string | null;
};

type PayoutMode = "referral" | "survey";

type ReferralPayoutDetail = {
  id: string;
  referredLeadId: string | null;
  referredName: string;
  referredMobile: string;
  referredStatus: string | null;
  rewardStatus: string;
  rewardAmount: number | null;
  countsTowardPayable: boolean;
  earnedAt: string | null;
  createdAt: string;
  pendingKind: "terminated" | "duplicate_qc" | "other" | null;
  pendingReason: string | null;
};

type SortBy =
  | "leadId"
  | "fullName"
  | "totalAmount"
  | "paymentStatus"
  | "paymentDate";

type PayoutCounts = {
  mode: { referral: number; survey: number };
  duplicate: { all: number; flagged: number; clean: number; ip_review: number };
};

const EMPTY_COUNTS: PayoutCounts = {
  mode: { referral: 0, survey: 0 },
  duplicate: { all: 0, flagged: 0, clean: 0, ip_review: 0 },
};

function parseModeParam(value: string | null): PayoutMode {
  return value === "survey" ? "survey" : "referral";
}

function parseDuplicateParam(value: string | null): PayoutDuplicateFilter {
  if (
    value === "flagged" ||
    value === "clean" ||
    value === "ip_review"
  ) {
    return value;
  }
  return "all";
}

function parseStatusParam(
  value: string | null,
): "all" | "pending" | "ready" | "paid" {
  if (value === "pending" || value === "ready" || value === "paid") return value;
  return "all";
}

function parseSortByParam(value: string | null, mode: PayoutMode): SortBy {
  if (
    value === "leadId" ||
    value === "fullName" ||
    value === "totalAmount" ||
    value === "paymentStatus" ||
    value === "paymentDate"
  ) {
    return value;
  }
  return mode === "referral" ? "totalAmount" : "leadId";
}

function amountForMode(row: PayoutApiRow, mode: PayoutMode) {
  return mode === "referral" ? row.referralEarnings : row.surveyEarnings;
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
    referralsName:
      mode === "referral"
        ? `${row.referralEarnedCount} earned / ${row.referralTotalCount} total${row.referralsName ? ` · ${row.referralsName}` : ""}`
        : row.referralsName,
    referralCount: mode === "referral" ? row.referralEarnedCount : undefined,
    referralTotalCount:
      mode === "referral" ? row.referralTotalCount : undefined,
    payoutReferenceId: row.payoutReferenceId,
  }));
}

function rewardVariant(status: string): StatusPillVariant {
  const n = status.toLowerCase();
  if (n === "paid") return "success";
  if (n === "earned") return "review";
  return "pending";
}

function summarizeReferralDetails(rows: ReferralPayoutDetail[]) {
  let earned = 0;
  let pendingQc = 0;
  let notPayable = 0;
  let earnedAmount = 0;
  let pendingQcAmount = 0;
  for (const r of rows) {
    if (r.rewardStatus === "earned" && r.countsTowardPayable) {
      earned++;
      earnedAmount += r.rewardAmount ?? 0;
    } else if (r.rewardStatus === "earned") {
      notPayable++;
    } else if (r.rewardStatus === "pending") {
      if (r.pendingKind === "terminated") {
        notPayable++;
      } else {
        pendingQc++;
        pendingQcAmount += r.rewardAmount ?? 0;
      }
    }
  }
  return {
    total: rows.length,
    earned,
    pendingQc,
    notPayable,
    earnedAmount,
    pendingQcAmount,
  };
}

export function PayoutsTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mode = parseModeParam(searchParams.get("mode"));
  const duplicateFilter = parseDuplicateParam(searchParams.get("duplicate"));
  const search = searchParams.get("search") ?? "";
  const status = parseStatusParam(searchParams.get("status"));
  const sortBy = parseSortByParam(searchParams.get("sortBy"), mode);
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const [rows, setRows] = useState<PayoutApiRow[]>([]);
  const [counts, setCounts] = useState<PayoutCounts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PayoutApiRow | null>(null);

  // Referral-mode drawer state
  const [referralDrawerRow, setReferralDrawerRow] = useState<PayoutApiRow | null>(null);
  const [referralDetails, setReferralDetails] = useState<ReferralPayoutDetail[]>([]);
  const [referralDetailsLoading, setReferralDetailsLoading] = useState(false);

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      const omitDefault =
        value === null ||
        value === "" ||
        (key === "mode" && value === "referral") ||
        (key === "duplicate" && value === "all") ||
        (key === "status" && value === "all") ||
        (key === "sortBy" &&
          value === (mode === "referral" ? "totalAmount" : "leadId")) ||
        (key === "sortDir" && value === "desc");
      if (omitDefault) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "10000",
        sortBy,
        sortDir,
        mode,
        duplicate: duplicateFilter,
        status,
      });
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/admin/payouts?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load payouts.");
      }
      setRows((payload.rows ?? []) as PayoutApiRow[]);
      setTotal(typeof payload.total === "number" ? payload.total : 0);
      setCounts(payload.counts ?? EMPTY_COUNTS);
    } catch (fetchError) {
      toastError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load payouts.",
      );
    } finally {
      setLoading(false);
    }
  }, [duplicateFilter, mode, search, sortBy, sortDir, status]);

  useEffect(() => {
    void loadPayouts();
  }, [loadPayouts]);

  const filteredRows = rows;

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
  }, [mode, search, status, sortBy, sortDir, duplicateFilter, resetPage]);

  useEffect(() => {
    clearSelection();
  }, [mode, duplicateFilter, clearSelection]);

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
    const duplicateLabel = payoutDuplicateFilterLabel(duplicateFilter);
    const modeLabel = mode === "referral" ? "Referral" : "Survey";
    const filterSuffix =
      duplicateFilter === "all" ? "" : `-${duplicateFilter}`;
    const filterMeta = {
      payoutType: modeLabel,
      duplicateStatus: duplicateLabel,
      rowCount: payoutRows.length,
      note:
        duplicateFilter === "all"
          ? "Duplicate status filter: All (complete list for this payout type)."
          : `Filtered to ${duplicateLabel} rows only — not the full ${modeLabel} payout list.`,
    };

    if (format === "xlsx") {
      downloadRazorpayPayoutExcel({
        filename: `razorpayx-upi-payout-${mode}${filterSuffix}-${stamp}.xlsx`,
        payoutRows,
        filterMeta,
      });
    } else {
      downloadRazorpayPayoutCsv({
        filename: `razorpayx-upi-payout-${mode}${filterSuffix}-${stamp}.csv`,
        payoutRows,
        filterMeta,
      });
    }

    const parts = [
      `${summary.total} row(s) exported`,
      `${modeLabel} · ${duplicateLabel}`,
    ];
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

  const openReferralDrawer = useCallback(async (row: PayoutApiRow) => {
    setReferralDrawerRow(row);
    setReferralDetails([]);
    setReferralDetailsLoading(true);
    try {
      const response = await fetch(
        `/api/admin/payouts/${encodeURIComponent(row.leadId)}/referrals`,
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to load.");
      setReferralDetails((payload.rows ?? []) as ReferralPayoutDetail[]);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to load referral details.");
    } finally {
      setReferralDetailsLoading(false);
    }
  }, []);

  function updateRowUpi(leadId: string, upiId: string | null) {
    setRows((current) =>
      current.map((row) => (row.leadId === leadId ? { ...row, upiId } : row)),
    );
    setSelected((current) =>
      current?.leadId === leadId ? { ...current, upiId } : current,
    );
    setReferralDrawerRow((current) =>
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
            Referral shows only referrers with earned payout due. Survey keeps
            its existing completed / QC payout list unchanged.
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
                count: counts.mode.referral,
              },
              {
                id: "survey" as const,
                label: "Survey",
                count: counts.mode.survey,
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
                onClick={() => patchParams({ mode: item.id })}
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
            onChange={(event) =>
              patchParams({ search: event.target.value })
            }
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
              patchParams({ status: event.target.value })
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
            Duplicate status
          </label>
          <Select
            className="w-[180px]"
            value={duplicateFilter}
            onChange={(event) =>
              patchParams({ duplicate: event.target.value })
            }
          >
            {PAYOUT_DUPLICATE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({counts.duplicate[option.value]})
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Sort by
          </label>
          <Select
            className="w-[160px]"
            value={sortBy}
            onChange={(event) => patchParams({ sortBy: event.target.value })}
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
            onChange={(event) => patchParams({ sortDir: event.target.value })}
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

      <p className="text-sm text-plum-muted">
        Showing{" "}
        <span className="font-mono font-semibold text-foreground">{total}</span>{" "}
        {mode === "referral" ? "referral" : "survey"} row
        {total === 1 ? "" : "s"}
        {duplicateFilter === "all"
          ? ""
          : ` · ${payoutDuplicateFilterLabel(duplicateFilter).toLowerCase()}`}
        {search.trim() ? ` · search “${search.trim()}”` : ""}
        {status !== "all" ? ` · payment ${status}` : ""}
        {mode !== "referral"
          ? ". Fingerprint matches are stronger than IP-only matches — IP can be shared Wi\u2011Fi or carrier NAT."
          : ". Referral payable uses earned referrals only."}
      </p>

      {mode === "referral" ? (
        <ReferralPayoutSummary rows={rows} />
      ) : null}

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
              <TableHead>{mode === "referral" ? "Referrer" : "Participant"}</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>{mode === "referral" ? "UPI" : "Payment"}</TableHead>
              {mode === "referral" ? (
                <>
                  <TableHead>Total referred</TableHead>
                  <TableHead>Earned</TableHead>
                  <TableHead>Payable amount</TableHead>
                </>
              ) : (
                <>
                  <TableHead>Survey amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>UPI</TableHead>
                </>
              )}
              <TableHead>QC</TableHead>
              <TableHead>Duplicate</TableHead>
              {mode === "referral" ? <TableHead>Payment</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={mode === "referral" ? 11 : 9}
                  className="py-8 text-center text-muted-foreground"
                >
                  Loading payouts…
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={mode === "referral" ? 11 : 9}
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
                  onClick={() =>
                    mode === "referral"
                      ? void openReferralDrawer(row)
                      : setSelected(row)
                  }
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
                  <TableCell className="font-medium">
                    {row.fullName || "Anonymous"}
                  </TableCell>
                  <TableCell className="font-mono text-[12px]">
                    {row.mobile || "—"}
                  </TableCell>
                  {mode === "referral" ? (
                    <>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <PayoutUpiEditor
                          leadId={row.leadId}
                          upiId={row.upiId}
                          onSaved={(upiId) => updateRowUpi(row.leadId, upiId)}
                        />
                        {!row.upiId ? (
                          <span
                            className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                            title="No UPI ID — cannot pay"
                          >
                            Missing UPI
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-[12px] font-semibold">
                        {row.referralTotalCount ?? 0}
                      </TableCell>
                      <TableCell className="font-mono text-[12px] font-semibold">
                        {row.referralEarnedCount ?? 0}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(row.referralEarnings)}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>
                        <StatusPill variant={paymentVariant(row.paymentStatus)}>
                          {row.paymentStatus}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(row.surveyEarnings)}
                      </TableCell>
                      <TableCell>{formatDate(row.paymentDate)}</TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <PayoutUpiEditor
                          leadId={row.leadId}
                          upiId={row.upiId}
                          onSaved={(upiId) => updateRowUpi(row.leadId, upiId)}
                        />
                      </TableCell>
                    </>
                  )}
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
                  {mode === "referral" ? (
                    <TableCell>
                      <StatusPill variant={paymentVariant(row.paymentStatus)}>
                        {row.paymentStatus}
                      </StatusPill>
                    </TableCell>
                  ) : null}
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

      {/* Referral-mode drawer: shows referred persons for the selected referrer */}
      <Sheet
        open={referralDrawerRow !== null}
        onOpenChange={(open) => {
          if (!open) { setReferralDrawerRow(null); setReferralDetails([]); }
        }}
      >
        <SheetContent className="w-full max-w-[480px] gap-0 bg-background p-0 sm:max-w-[480px]">
          {referralDrawerRow ? (
            <ReferralDrawerContent
              row={referralDrawerRow}
              details={referralDetails}
              loading={referralDetailsLoading}
              onUpiSaved={(upiId) => updateRowUpi(referralDrawerRow.leadId, upiId)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Survey-mode (and fallback) drawer: participant detail */}
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
                    label="Fingerprint flag (ineligible)"
                    value={selected.duplicateFlag ? "Yes — INELIGIBLE" : "No"}
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
                        ? "⚠ Screener evasion"
                        : "—"
                    }
                  />
                  <DetailRow
                    label="Cluster ID"
                    value={selected.duplicateClusterId ?? "—"}
                    mono
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

// ─── Referral payout summary banner ────────────────────────────────────────

function ReferralPayoutSummary({ rows }: { rows: PayoutApiRow[] }) {
  const { totalAmount, missingUpiAmount, missingUpiCount } = useMemo(() => {
    let totalAmount = 0;
    let missingUpiAmount = 0;
    let missingUpiCount = 0;
    for (const row of rows) {
      totalAmount += row.referralEarnings;
      if (!row.upiId) {
        missingUpiAmount += row.referralEarnings;
        missingUpiCount++;
      }
    }
    return { totalAmount, missingUpiAmount, missingUpiCount };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-4 rounded-[12px] border border-border bg-card p-4 text-sm">
      <Stat label="Payees" value={String(rows.length)} />
      <Stat label="Total payable" value={formatCurrency(totalAmount)} />
      {missingUpiCount > 0 ? (
        <Stat
          label={`Blocked (no UPI · ${missingUpiCount})`}
          value={formatCurrency(missingUpiAmount)}
          warn
        />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-plum-muted">{label}</p>
      <p
        className={cn(
          "font-mono text-base font-semibold",
          warn ? "text-amber-600" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Referral drawer ────────────────────────────────────────────────────────

function formatCurrencyOrDash(amount: number | null) {
  if (amount === null || !Number.isFinite(amount)) return "—";
  return formatCurrency(amount);
}

function formatDateStr(value: string | null) {
  if (!value) return "—";
  return formatAdminDate(value);
}

function ReferralDrawerContent({
  row,
  details,
  loading,
  onUpiSaved,
}: {
  row: PayoutApiRow;
  details: ReferralPayoutDetail[];
  loading: boolean;
  onUpiSaved: (upiId: string | null) => void;
}) {
  const summary = useMemo(() => summarizeReferralDetails(details), [details]);

  return (
    <>
      <SheetHeader className="border-b border-border bg-card p-6">
        <SheetTitle className="text-lg font-bold text-foreground">
          {row.fullName || "Anonymous"}
        </SheetTitle>
        <p className="font-mono text-xs text-muted-foreground">
          {row.mobile || "No mobile"}
          {row.city ? ` · ${row.city}` : ""}
          {" · "}
          {row.leadId}
        </p>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-6">
        <SectionTitle>Referrer</SectionTitle>
        <DetailRow label="Name" value={row.fullName || "Anonymous"} />
        <DetailRow label="Mobile" value={row.mobile || "—"} mono />
        <DetailRow label="UPI ID" value={row.upiId || "Missing UPI"} mono />

        <SectionTitle>UPI</SectionTitle>
        {row.upiId ? null : (
          <div className="mb-3 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            No UPI ID — this person cannot be paid until one is added.
          </div>
        )}
        <div className="flex items-center justify-between gap-4 border-b border-dashed border-border py-2.5 text-sm">
          <span className="shrink-0 text-plum-muted">UPI</span>
          <PayoutUpiEditor
            leadId={row.leadId}
            upiId={row.upiId}
            variant="drawer"
            onSaved={onUpiSaved}
          />
        </div>

        {/* Earnings summary */}
        <SectionTitle>Referral earnings</SectionTitle>
        <DetailRow label="Payable (earned)" value={formatCurrencyOrDash(row.referralEarnings)} />
        {loading ? (
          <p className="py-4 text-center text-sm text-plum-muted">Loading referrals…</p>
        ) : (
          <>
            <DetailRow label="Referred total" value={String(summary.total)} />
            <DetailRow label="Earned" value={String(summary.earned)} />
            <DetailRow label="Pending QC" value={String(summary.pendingQc)} />
            <DetailRow label="Not payable" value={String(summary.notPayable)} />
            <DetailRow
              label="Amount pending QC"
              value={summary.pendingQcAmount > 0 ? formatCurrency(summary.pendingQcAmount) : "—"}
            />

            {/* Per-referral list */}
            <SectionTitle>All referrals</SectionTitle>
            {details.length === 0 ? (
              <p className="text-sm text-plum-muted">No referrals found.</p>
            ) : (
              <ul className="space-y-3">
                {details.map((r) => (
                  <ReferralDetailCard key={r.id} r={r} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}

function ReferralDetailCard({ r }: { r: ReferralPayoutDetail }) {
  const isTerminated = r.rewardStatus === "pending" && r.pendingKind === "terminated";
  const isDuplicatePending =
    r.rewardStatus === "pending" && r.pendingKind === "duplicate_qc";

  return (
    <li className="rounded-[10px] border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">
            {r.referredName || "Anonymous"}
          </p>
          <p className="font-mono text-xs text-plum-muted">
            {r.referredMobile || "—"}
            {r.referredLeadId ? ` · ${r.referredLeadId}` : ""}
          </p>
        </div>
        <StatusPill variant={rewardVariant(r.rewardStatus)}>
          {r.rewardStatus}
        </StatusPill>
      </div>
      <p className="mt-1.5 text-xs text-plum-muted">
        {formatCurrencyOrDash(r.rewardAmount)} · {formatDateStr(r.createdAt)}
        {r.referredStatus ? ` · ${r.referredStatus}` : ""}
      </p>
      {r.rewardStatus === "pending" ? (
        <p
          className={cn(
            "mt-2 rounded px-2 py-1 text-xs",
            isTerminated
              ? "bg-gray-100 text-gray-600"
              : isDuplicatePending
                ? "bg-amber-50 text-amber-700"
                : "bg-blue-50 text-blue-700",
          )}
        >
          {r.pendingReason ?? "Pending."}
        </p>
      ) : null}
      {r.rewardStatus === "earned" && !r.countsTowardPayable ? (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
          Fingerprint-flagged referred participant. This earned row does not count
          toward payable amount.
        </p>
      ) : null}
    </li>
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
