"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";

import { TerminationDetailsDrawer } from "@/components/admin/termination-details-drawer";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FormTerminationRow } from "@/server/repositories/form-terminations.repository";
import { formatAdminDateTime } from "@/lib/format-admin-datetime";

type FilterOptions = {
  formTypes: string[];
  ruleKeys: string[];
  questionKeys: string[];
  statuses: string[];
};

type TerminationTableProps = {
  initialRows: FormTerminationRow[];
  filterOptions: FilterOptions;
};

function formatSubmittedAt(value: string) {
  return formatAdminDateTime(value);
}

function formLabel(formType: string) {
  if (formType === "registration") return "Registration Form";
  if (formType === "survey") return "Survey Form";
  return formType;
}

export function TerminationTable({
  initialRows,
  filterOptions,
}: TerminationTableProps) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [formType, setFormType] = useState("all");
  const [ruleKey, setRuleKey] = useState("all");
  const [questionKey, setQuestionKey] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const params = new URLSearchParams();
      if (formType !== "all") params.set("formType", formType);
      if (ruleKey !== "all") params.set("ruleKey", ruleKey);
      if (questionKey !== "all") params.set("questionKey", questionKey);
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());

      try {
        const response = await fetch(`/api/admin/terminations?${params}`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
          setRows((payload.rows ?? []) as FormTerminationRow[]);
        }
      } catch {
        // Ignore aborted requests.
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [formType, ruleKey, questionKey, status, search]);

  const visibleRows = useMemo(() => rows, [rows]);

  function openDetails(id: string) {
    setSelectedId(id);
    setDrawerOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-foreground">Terminations</h2>
        <p className="mt-1 text-sm text-plum-muted">
          Every participant terminated by form rules appears here. Click a row for
          full response details.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <div className="relative min-w-0 lg:col-span-2 xl:col-span-3">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Lead ID, mobile, or name..."
              className="pl-9"
            />
          </div>

          <FilterSelect
            label="Form"
            value={formType}
            options={filterOptions.formTypes}
            onChange={setFormType}
          />
          <FilterSelect
            label="Termination rule"
            value={ruleKey}
            options={filterOptions.ruleKeys}
            onChange={setRuleKey}
          />
          <FilterSelect
            label="Question"
            value={questionKey}
            options={filterOptions.questionKeys}
            onChange={setQuestionKey}
          />
          <FilterSelect
            label="Status"
            value={status}
            options={filterOptions.statuses}
            onChange={setStatus}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-rose-tint shadow-sm">
            <TableRow>
              <TableHead>Lead ID</TableHead>
              <TableHead>Participant</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Termination Rule</TableHead>
              <TableHead>Question</TableHead>
              <TableHead>Answer</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Form</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-10 text-center text-sm text-plum-muted"
                >
                  No terminations match your filters.
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => openDetails(row.id)}
                >
                  <TableCell className="font-mono text-[11.5px]">
                    {row.leadId}
                  </TableCell>
                  <TableCell>{row.participantName ?? "—"}</TableCell>
                  <TableCell className="font-mono text-[12px]">
                    {row.participantMobile ?? "—"}
                  </TableCell>
                  <TableCell>{row.ruleLabel ?? row.ruleKey}</TableCell>
                  <TableCell>{row.questionLabel ?? row.questionKey ?? "—"}</TableCell>
                  <TableCell>{row.answerValue ?? "—"}</TableCell>
                  <TableCell>{row.reasonText ?? "—"}</TableCell>
                  <TableCell>{formLabel(row.formType)}</TableCell>
                  <TableCell>{formatSubmittedAt(row.submittedAt)}</TableCell>
                  <TableCell>{row.participantStatus ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TerminationDetailsDrawer
        terminationId={selectedId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-plum-muted">
        {label}
      </span>
      <select
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
