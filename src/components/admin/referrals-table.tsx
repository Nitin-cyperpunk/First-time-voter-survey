"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { GridExportButtons } from "@/components/admin/grid-export-buttons";
import { TablePagination } from "@/components/admin/bulk-selection";
import { Input } from "@/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { formatAdminDateTime } from "@/lib/format-admin-datetime";
import { exportReferralRows } from "@/lib/referrals/referral-export";
import { toastError } from "@/lib/toast";

export type ReferralTableRow = {
  id: string;
  referrerLeadId: string | null;
  referredLeadId: string | null;
  referrerName: string;
  referrerMobile: string;
  referredName: string;
  referredMobile: string;
  rewardStatus: string;
  rewardAmount: number | null;
  pendingReason: string | null;
  referredStatus: string | null;
  terminationReason: string | null;
  earnedAt: string | null;
  createdAt: string;
};

function rewardVariant(status: string): StatusPillVariant {
  const normalized = status.toLowerCase();
  if (normalized.includes("paid") || normalized.includes("success")) {
    return "success";
  }
  if (normalized.includes("earned")) return "review";
  if (normalized.includes("pending")) return "pending";
  return "review";
}

function displayName(value: string) {
  return value.trim() ? value : "Anonymous";
}

function displayMobile(value: string) {
  return value.trim() ? value : "—";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return formatAdminDateTime(value);
}

function formatAmount(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN")}`;
}

function formatPendingRecorded(pendingCount: number, amount: number) {
  if (pendingCount === 0) return "—";
  if (amount === 0) return "not recorded yet";
  return formatAmount(amount);
}

function referrerKey(row: ReferralTableRow) {
  return row.referrerLeadId ?? `unknown:${row.id}`;
}

function summarize(rows: ReferralTableRow[]) {
  let earned = 0;
  let pending = 0;
  let earnedAmount = 0;
  let pendingAmount = 0;
  for (const row of rows) {
    const status = row.rewardStatus.toLowerCase();
    if (status === "pending") {
      pending += 1;
      pendingAmount += row.rewardAmount ?? 0;
    } else if (status === "earned" || status === "paid") {
      earned += 1;
      earnedAmount += row.rewardAmount ?? 0;
    }
  }
  return {
    total: rows.length,
    earned,
    pending,
    earnedAmount,
    pendingAmount,
  };
}

function RewardStatusCell({ row }: { row: ReferralTableRow }) {
  const pill = (
    <StatusPill variant={rewardVariant(row.rewardStatus)}>
      {row.rewardStatus}
    </StatusPill>
  );

  if (row.rewardStatus.toLowerCase() !== "pending") {
    return pill;
  }

  const reason = row.pendingReason ?? "Reason not recorded.";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-help text-left"
          aria-label={reason}
        >
          {pill}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[280px] bg-foreground px-3 py-2 text-left text-xs text-background"
      >
        {reason}
      </TooltipContent>
    </Tooltip>
  );
}

export function ReferralsTable({
  initialRows,
}: {
  initialRows: ReferralTableRow[];
}) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async (referrer: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (referrer.trim()) params.set("referrer", referrer.trim());
      const query = params.toString();
      const response = await fetch(
        `/api/admin/referrals${query ? `?${query}` : ""}`,
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load referrals.");
      }
      setRows((payload.rows ?? []) as ReferralTableRow[]);
    } catch (error) {
      toastError(
        error instanceof Error ? error.message : "Failed to load referrals.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load(search);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [load, search]);

  const summary = useMemo(() => summarize(rows), [rows]);

  const referrerCount = useMemo(() => {
    const keys = new Set(rows.map(referrerKey));
    return keys.size;
  }, [rows]);

  const orderedRows = useMemo(() => {
    if (referrerCount <= 1) return rows;
    const groups = new Map<string, ReferralTableRow[]>();
    for (const row of rows) {
      const key = referrerKey(row);
      const list = groups.get(key);
      if (list) list.push(row);
      else groups.set(key, [row]);
    }
    return [...groups.values()]
      .sort((a, b) => {
        const aLatest = a[0]?.createdAt ?? "";
        const bLatest = b[0]?.createdAt ?? "";
        return bLatest.localeCompare(aLatest);
      })
      .flat();
  }, [rows, referrerCount]);

  const pagination = useClientPagination(orderedRows);
  const { resetPage } = pagination;

  useEffect(() => {
    resetPage();
  }, [search, resetPage]);

  const groupedPage = useMemo(() => {
    const groups: Array<{ key: string; rows: ReferralTableRow[] }> = [];
    const indexByKey = new Map<string, number>();
    for (const row of pagination.pageItems) {
      const key = referrerKey(row);
      const existing = indexByKey.get(key);
      if (existing == null) {
        indexByKey.set(key, groups.length);
        groups.push({ key, rows: [row] });
      } else {
        groups[existing]!.rows.push(row);
      }
    }
    return groups;
  }, [pagination.pageItems]);

  // Drawer is keyed on this row's REFERRER (referrerLeadId), not the referred person.
  const drawerRows = useMemo(() => {
    if (!selectedKey) return [];
    return rows.filter((row) => referrerKey(row) === selectedKey);
  }, [rows, selectedKey]);

  const drawerSummary = useMemo(() => summarize(drawerRows), [drawerRows]);
  const drawerHead = drawerRows[0] ?? null;

  // Export the API-filtered set (all matching referrer edges), not the current page.
  function exportFiltered(format: "csv" | "excel") {
    if (rows.length === 0) {
      toastError("Nothing to export.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const suffix = search.trim() ? "-filtered" : "";
    exportReferralRows(rows, format, `referrals${suffix}-${stamp}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Filter by referrer (not the referred person)
          </label>
          <Input
            placeholder="Referrer name, mobile, or lead ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Filter referrals by referrer name, mobile, or lead ID"
          />
        </div>
        <GridExportButtons
          disabled={loading || rows.length === 0}
          onExportCsv={async () => exportFiltered("csv")}
          onExportExcel={async () => exportFiltered("excel")}
        />
      </div>

      <p className="text-sm text-plum-muted">
        Showing{" "}
        <span className="font-mono font-semibold text-foreground">
          {summary.total}
        </span>{" "}
        referral{summary.total === 1 ? "" : "s"} from {referrerCount} referrer
        {referrerCount === 1 ? "" : "s"}
        {" · "}
        {summary.earned} earned ({formatAmount(summary.earnedAmount)})
        {" · "}
        {summary.pending} pending
        {summary.pending > 0
          ? ` (${formatPendingRecorded(summary.pending, summary.pendingAmount)})`
          : ""}
        {search.trim() ? ` · referrer filter “${search.trim()}”` : ""}.
      </p>

      {referrerCount > 1 ? (
        <p className="text-xs text-plum-muted">
          Multiple referrers match. Rows are grouped by referrer identity
          (lead / mobile), not by name.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Referrer</TableHead>
              <TableHead>Referrer mobile</TableHead>
              <TableHead>Referred</TableHead>
              <TableHead>Referred mobile</TableHead>
              <TableHead>Reward status</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  Loading referrals…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  {search.trim()
                    ? "No referrals for that referrer."
                    : "No referrals yet."}
                </TableCell>
              </TableRow>
            ) : (
              groupedPage.map((group) => (
                <GroupRows
                  key={group.key}
                  group={group}
                  showGroupHeader={referrerCount > 1}
                  onOpen={() => setSelectedKey(group.key)}
                />
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

      <Sheet
        open={selectedKey !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedKey(null);
        }}
      >
        <SheetContent className="w-full max-w-[480px] gap-0 bg-background p-0 sm:max-w-[480px]">
          {drawerHead ? (
            <>
              <SheetHeader className="border-b border-border bg-card p-6">
                <SheetTitle className="text-lg font-bold text-foreground">
                  {displayName(drawerHead.referrerName)}
                </SheetTitle>
                <p className="font-mono text-xs text-muted-foreground">
                  {displayMobile(drawerHead.referrerMobile)}
                  {drawerHead.referrerLeadId
                    ? ` · ${drawerHead.referrerLeadId}`
                    : ""}
                </p>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-6">
                <p className="text-sm text-plum-muted">
                  Referred {drawerSummary.total} · {drawerSummary.earned}{" "}
                  earned · {drawerSummary.pending} pending
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  Earned {formatAmount(drawerSummary.earnedAmount)}
                  {" · "}
                  Pending{" "}
                  {formatPendingRecorded(
                    drawerSummary.pending,
                    drawerSummary.pendingAmount,
                  )}
                </p>
                <ul className="mt-5 space-y-3">
                  {drawerRows.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-[10px] border border-border bg-card p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">
                            {displayName(row.referredName)}
                          </p>
                          <p className="font-mono text-xs text-plum-muted">
                            {displayMobile(row.referredMobile)}
                          </p>
                        </div>
                        <RewardStatusCell row={row} />
                      </div>
                      <p className="mt-2 text-xs text-plum-muted">
                        {formatAmount(row.rewardAmount)} · {formatDate(row.createdAt)}
                      </p>
                      {row.rewardStatus.toLowerCase() === "pending" ? (
                        <p className="mt-2 text-sm text-foreground">
                          {row.pendingReason ?? "Reason not recorded."}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function GroupRows({
  group,
  showGroupHeader,
  onOpen,
}: {
  group: { key: string; rows: ReferralTableRow[] };
  showGroupHeader: boolean;
  onOpen: () => void;
}) {
  const head = group.rows[0]!;
  return (
    <>
      {showGroupHeader ? (
        <TableRow className="bg-rose-tint/40 hover:bg-rose-tint/40">
          <TableCell colSpan={7} className="py-2 text-xs font-semibold text-plum-muted">
            {displayName(head.referrerName)} · {displayMobile(head.referrerMobile)}
            {head.referrerLeadId ? ` · ${head.referrerLeadId}` : ""}
          </TableCell>
        </TableRow>
      ) : null}
      {group.rows.map((referral) => (
        <TableRow
          key={referral.id}
          className="cursor-pointer"
          onClick={onOpen}
        >
          <TableCell className="font-medium">
            {displayName(referral.referrerName)}
          </TableCell>
          <TableCell className="font-mono text-[12px]">
            {displayMobile(referral.referrerMobile)}
          </TableCell>
          <TableCell>{displayName(referral.referredName)}</TableCell>
          <TableCell className="font-mono text-[12px]">
            {displayMobile(referral.referredMobile)}
          </TableCell>
          <TableCell onClick={(event) => event.stopPropagation()}>
            <RewardStatusCell row={referral} />
          </TableCell>
          <TableCell>{formatAmount(referral.rewardAmount)}</TableCell>
          <TableCell>{formatDate(referral.createdAt)}</TableCell>
        </TableRow>
      ))}
    </>
  );
}
