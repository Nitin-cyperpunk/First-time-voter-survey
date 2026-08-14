"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AreaType } from "@/lib/india-states";
import type { QuotaSnapshot, QuotaStateRow } from "@/lib/quota/types";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastSuccess,
} from "@/lib/toast";

type SnapshotPayload = QuotaSnapshot & {
  regions?: string[];
  error?: string;
  unmatchedCities?: Array<{ raw: string; count: number; latestAt: string }>;
  unmatchedGlobalCompletes?: number;
};

export function CityTargetsPanel({
  totalCapacity,
  onCapacityHintChange,
}: {
  totalCapacity: number;
  onCapacityHintChange?: (stateAllocationSum: number) => void;
}) {
  const [payload, setPayload] = useState<SnapshotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [editAlloc, setEditAlloc] = useState<Record<string, string>>({});
  const [editUrbanPct, setEditUrbanPct] = useState<Record<string, string>>({});
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({});
  const [reFrom, setReFrom] = useState("");
  const [reTo, setReTo] = useState("");
  const [reAmount, setReAmount] = useState(1);
  const [reReason, setReReason] = useState("");
  const [importPreview, setImportPreview] = useState<{
    preview: {
      toAdd: Array<{
        rowNumber: number;
        city: string;
        state: string;
        areaType: string;
      }>;
      toUpdate: Array<{
        rowNumber: number;
        city: string;
        state: string;
        areaType: string;
      }>;
      rejected: Array<{
        rowNumber: number;
        city: string;
        state: string;
        reason?: string;
      }>;
    };
    fileName: string;
    counts: { add: number; update: number; reject: number };
  } | null>(null);
  const [unmatched, setUnmatched] = useState<
    Array<{ raw: string; count: number; latestAt: string }>
  >([]);
  const [unmatchedGlobal, setUnmatchedGlobal] = useState(0);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/cities");
    const data = (await response.json()) as SnapshotPayload;
    if (!response.ok) throw new Error(data.error ?? "Failed to load City Targets.");
    setPayload(data);
    setUnmatched(data.unmatchedCities ?? []);
    setUnmatchedGlobal(data.unmatchedGlobalCompletes ?? 0);
    setEditAlloc({});
    setEditUrbanPct({});
    setEditBuffer({});
    onCapacityHintChange?.(data.stateAllocationSum);
  }, [onCapacityHintChange]);

  useEffect(() => {
    void load()
      .catch((error: unknown) => {
        toastError(error instanceof Error ? error.message : "Failed to load City Targets.");
      })
      .finally(() => setLoading(false));
  }, [load]);

  const cellOptions = useMemo(() => {
    if (!payload) return [];
    return payload.states.flatMap((row) => [
      `${row.state}|urban`,
      `${row.state}|rural`,
    ]);
  }, [payload]);

  async function previewImport(file: File) {
    const loadingId = toastLoading("Reading city file…");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/cities/import", {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Import preview failed.");
      setImportPreview({
        preview: data.preview,
        fileName: data.fileName ?? file.name,
        counts: data.counts,
      });
      dismissToast(loadingId);
      toastSuccess(
        `Preview ready: ${data.counts.add} add · ${data.counts.update} update · ${data.counts.reject} reject.`,
      );
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Import preview failed.");
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    const loadingId = toastLoading("Importing cities…");
    try {
      const form = new FormData();
      form.append("confirm", "1");
      form.append("preview", JSON.stringify(importPreview.preview));
      form.append("fileName", importPreview.fileName);
      const response = await fetch("/api/admin/cities/import", {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Import failed.");
      setImportPreview(null);
      await load();
      dismissToast(loadingId);
      toastSuccess(
        `Imported ${data.added ?? 0} new · updated ${data.updated ?? 0}. Recalculate cells as needed.`,
      );
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Import failed.");
    }
  }

  async function saveStateQuota(row: QuotaStateRow) {
    if (!payload) return;
    const allocation = Math.max(
      0,
      Number(editAlloc[row.state] ?? row.allocation) || 0,
    );
    const urbanPct = Math.min(
      100,
      Math.max(0, Number(editUrbanPct[row.state] ?? row.urbanPct) || 0),
    );
    const loadingId = toastLoading("Saving state quota…");
    try {
      const response = await fetch("/api/admin/quota", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          states: payload.states.map((item) =>
            item.state === row.state
              ? {
                  state: item.state,
                  allocation,
                  allocationManual: true,
                  urbanPct,
                  urbanPctManual: urbanPct !== payload.urbanPct,
                }
              : {
                  state: item.state,
                  allocation: item.allocation,
                  allocationManual: item.allocationManual,
                  urbanPct: item.urbanPct,
                  urbanPctManual: item.urbanPctManual,
                },
          ),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Failed to save quota.");
      await load();
      dismissToast(loadingId);
      toastSuccess("State quota saved.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Failed to save quota.");
    }
  }

  async function saveBuffer(cityId: string, current: number) {
    const next = Math.max(0, Number(editBuffer[cityId] ?? current) || 0);
    const loadingId = toastLoading("Saving buffer…");
    try {
      const response = await fetch(`/api/admin/cities/${cityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buffer: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Failed to save buffer.");
      await load();
      dismissToast(loadingId);
      toastSuccess("Buffer saved.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Failed to save buffer.");
    }
  }

  async function patchCity(
    cityId: string,
    body: Record<string, unknown>,
    okMessage: string,
  ) {
    const loadingId = toastLoading("Updating city…");
    try {
      const response = await fetch(`/api/admin/cities/${cityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Failed to update city.");
      await load();
      dismissToast(loadingId);
      toastSuccess(okMessage);
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Failed to update city.");
    }
  }

  async function removeCity(cityId: string) {
    const loadingId = toastLoading("Deleting city…");
    try {
      const response = await fetch(`/api/admin/cities/${cityId}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Failed to delete city.");
      await load();
      dismissToast(loadingId);
      toastSuccess("City deleted.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Failed to delete city.");
    }
  }

  async function recalculate(stateName: string, cellArea: AreaType) {
    const loadingId = toastLoading("Recalculating targets…");
    try {
      const response = await fetch("/api/admin/quota/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: stateName, areaType: cellArea }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Recalculate failed.");
      await load();
      dismissToast(loadingId);
      toastSuccess("Cell targets recalculated.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Recalculate failed.");
    }
  }

  async function reallocate() {
    const [fromState, fromAreaType] = reFrom.split("|") as [string, AreaType];
    const [toState, toAreaType] = reTo.split("|") as [string, AreaType];
    if (!fromState || !toState) return;
    const loadingId = toastLoading("Reallocating…");
    try {
      const response = await fetch("/api/admin/quota/reallocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromState,
          fromAreaType,
          toState,
          toAreaType,
          amount: reAmount,
          reason: reReason || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Reallocation failed.");
      setReReason("");
      await load();
      dismissToast(loadingId);
      toastSuccess("Reallocation logged.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Reallocation failed.");
    }
  }

  const unallocated = payload
    ? payload.unallocated
    : totalCapacity;

  return (
    <section className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">City Targets</h3>
      <p className="mt-2 text-sm leading-relaxed text-plum-muted">
        Sampling design is <strong>controlled 50:50 urban / rural within each
        state</strong>, inside the global cap — not PPS. National estimates need
        weights. Report the unweighted urban:rural ratio at close. Status is
        Achieved / Closes at only. Gender quota is not applied.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-plum-muted">
        Q15_1 / Q15_2 are self-report and never drive these cells. Respondents type
        a free-text city; the server resolves it to this list (exact, then alias).
        Unmatched completes count toward the <strong>global cap only</strong>.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Global cap" value={String(payload?.totalCapacity ?? totalCapacity)} />
        <Stat
          label="State alloc sum"
          value={`${payload?.stateAllocationSum ?? 0} · unalloc ${unallocated}`}
        />
        <Stat
          label="Unweighted urban %"
          value={
            payload?.unweightedUrbanPct == null
              ? "—"
              : `${payload.unweightedUrbanPct}% (${payload.skewPoints ?? 0} pts vs 50)`
          }
        />
        <Stat
          label="Completes"
          value={`${payload?.achievedGlobal ?? 0} · U ${payload?.achievedUrban ?? 0} / R ${payload?.achievedRural ?? 0}`}
        />
      </div>

      {payload?.cellWarning ? (
        <p className="mt-4 rounded-[10px] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {payload.cellWarning}
        </p>
      ) : null}

      <div className="mt-5 rounded-[12px] border border-border p-4">
        <h4 className="text-sm font-semibold text-foreground">Bulk city import</h4>
        <p className="mt-1 text-xs leading-relaxed text-plum-muted">
          Upload CSV or XLSX with columns{" "}
          <code className="text-[11px]">city, state, area_type</code> (urban/rural).
          Optional: <code className="text-[11px]">capacity</code>,{" "}
          <code className="text-[11px]">aliases</code> (pipe/comma separated). Existing
          capacity is kept unless the file provides capacity.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="max-w-md"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void previewImport(file);
            }}
          />
          {importPreview ? (
            <>
              <Button type="button" onClick={() => void confirmImport()}>
                Confirm import ({importPreview.counts.add + importPreview.counts.update})
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportPreview(null)}
              >
                Cancel preview
              </Button>
            </>
          ) : null}
        </div>
        {importPreview ? (
          <div className="mt-3 space-y-2 text-xs text-plum-muted">
            <p>
              {importPreview.fileName}: {importPreview.counts.add} add ·{" "}
              {importPreview.counts.update} update · {importPreview.counts.reject}{" "}
              reject
            </p>
            {importPreview.preview.rejected.slice(0, 8).map((row) => (
              <p key={`rej-${row.rowNumber}`} className="text-destructive">
                Row {row.rowNumber}: {row.city || "(blank)"} / {row.state || "—"} —{" "}
                {row.reason ?? "rejected"}
              </p>
            ))}
            {importPreview.preview.rejected.length > 8 ? (
              <p>…and {importPreview.preview.rejected.length - 8} more rejects.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-[12px] border border-border p-4">
        <h4 className="text-sm font-semibold text-foreground">Unmatched cities</h4>
        <p className="mt-1 text-xs leading-relaxed text-plum-muted">
          Completes that typed a city not in this list. They consume global capacity
          only ({unmatchedGlobal} unmatched completes). Add them via import or aliases
          if they should fill a cell.
        </p>
        {unmatched.length === 0 ? (
          <p className="mt-2 text-xs text-text-muted">No unmatched completes yet.</p>
        ) : (
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs text-plum-muted">
            {unmatched.map((row) => (
              <li key={row.raw}>
                <span className="font-medium text-foreground">{row.raw}</span> ·{" "}
                {row.count} complete{row.count === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-text-muted">Loading City Targets…</p>
      ) : (payload?.states.length ?? 0) === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          No states yet. Import a city file to start a quota cell.
        </p>
      ) : (
        payload?.states.map((row) => (
          <StateBlock
            key={row.state}
            row={row}
            globalUrbanPct={payload.urbanPct}
            editAlloc={editAlloc[row.state] ?? String(row.allocation)}
            editUrbanPct={editUrbanPct[row.state] ?? String(row.urbanPct)}
            editBuffer={editBuffer}
            onAllocChange={(value) =>
              setEditAlloc((current) => ({ ...current, [row.state]: value }))
            }
            onUrbanPctChange={(value) =>
              setEditUrbanPct((current) => ({ ...current, [row.state]: value }))
            }
            onBufferChange={(cityId, value) =>
              setEditBuffer((current) => ({ ...current, [cityId]: value }))
            }
            onSaveQuota={() => void saveStateQuota(row)}
            onSaveBuffer={(cityId, current) => void saveBuffer(cityId, current)}
            onToggleOpen={(cityId, isOpen) =>
              void patchCity(cityId, { isOpen }, isOpen ? "City opened." : "City closed.")
            }
            onToggleActive={(cityId, isActive) =>
              void patchCity(
                cityId,
                { isActive },
                isActive ? "City activated." : "City deactivated. Existing responses were kept.",
              )
            }
            onDelete={(cityId) => void removeCity(cityId)}
            onRecalculate={(area) => void recalculate(row.state, area)}
          />
        ))
      )}

      <div className="mt-8 rounded-[12px] border border-border p-4">
        <h4 className="text-sm font-semibold text-foreground">Soft reallocation</h4>
        <p className="mt-1 text-xs leading-relaxed text-plum-muted">
          Manual only. Donor cell must be ≤ {payload?.reallocation.minFillPct ?? 25}%
          full, last complete ≥ {payload?.reallocation.afterDays ?? 14} days ago,
          transfer ≤ {payload?.reallocation.maxTransferPctOfRemaining ?? 50}% of
          remaining. Logged with from-cell / to-cell / amount.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={reFrom} onChange={(event) => setReFrom(event.target.value)}>
            <option value="">From cell</option>
            {cellOptions.map((id) => (
              <option key={id} value={id}>
                {id.replace("|", " · ")}
              </option>
            ))}
          </Select>
          <Select value={reTo} onChange={(event) => setReTo(event.target.value)}>
            <option value="">To cell</option>
            {cellOptions.map((id) => (
              <option key={id} value={id}>
                {id.replace("|", " · ")}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min={1}
            value={reAmount}
            onChange={(event) => setReAmount(Math.max(1, Number(event.target.value) || 1))}
          />
          <Input
            placeholder="Reason"
            value={reReason}
            onChange={(event) => setReReason(event.target.value)}
          />
          <Button
            type="button"
            onClick={() => void reallocate()}
            disabled={!reFrom || !reTo}
          >
            Reallocate
          </Button>
        </div>
        {(payload?.reallocations.length ?? 0) > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-text-body">
            {payload?.reallocations.slice(0, 8).map((item) => (
              <li key={item.id} className="font-mono">
                {item.createdAt.slice(0, 10)} · {item.fromState}|{item.fromAreaType} →{" "}
                {item.toState}|{item.toAreaType} · {item.amount}
                {item.fromDaysSinceLastCompletion != null
                  ? ` · ${item.fromDaysSinceLastCompletion}d since last complete`
                  : ""}
                {item.reason ? ` · ${item.reason}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-accent-soft px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-plum-faint">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

function StateBlock({
  row,
  globalUrbanPct,
  editAlloc,
  editUrbanPct,
  editBuffer,
  onAllocChange,
  onUrbanPctChange,
  onSaveQuota,
  onSaveBuffer,
  onBufferChange,
  onToggleOpen,
  onToggleActive,
  onDelete,
  onRecalculate,
}: {
  row: QuotaStateRow;
  globalUrbanPct: number;
  editAlloc: string;
  editUrbanPct: string;
  editBuffer: Record<string, string>;
  onAllocChange: (value: string) => void;
  onUrbanPctChange: (value: string) => void;
  onSaveQuota: () => void;
  onSaveBuffer: (cityId: string, current: number) => void;
  onBufferChange: (cityId: string, value: string) => void;
  onToggleOpen: (cityId: string, isOpen: boolean) => void;
  onToggleActive: (cityId: string, isActive: boolean) => void;
  onDelete: (cityId: string) => void;
  onRecalculate: (area: AreaType) => void;
}) {
  const balance =
    row.urbanPct === 50
      ? "50:50"
      : `${row.urbanPct}/${100 - row.urbanPct}`;
  const dirty =
    Number(editAlloc) !== row.allocation || Number(editUrbanPct) !== row.urbanPct;

  return (
    <div className="mt-6 rounded-[12px] border border-border p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{row.state}</h4>
          <p className="mt-1 text-xs text-plum-muted">
            {row.achieved}/{row.allocation} · {row.pctFull}% · urban split {balance}
            {row.urbanPctManual ? " (override)" : ` (global ${globalUrbanPct}%)`}
            {row.allocationManual ? " · alloc override" : " · equal split"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-plum-faint">
              Allocation
            </span>
            <Input
              type="number"
              min={0}
              className="h-9 w-24"
              value={editAlloc}
              onChange={(event) => onAllocChange(event.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-plum-faint">
              Urban %
            </span>
            <Input
              type="number"
              min={0}
              max={100}
              className="h-9 w-20"
              value={editUrbanPct}
              onChange={(event) => onUrbanPctChange(event.target.value)}
            />
          </label>
          <Button type="button" size="sm" variant={dirty ? "default" : "outline"} onClick={onSaveQuota}>
            Save quota
          </Button>
        </div>
      </div>

      <CellTable
        title="Urban"
        cell={row.urban}
        editBuffer={editBuffer}
        onBufferChange={onBufferChange}
        onSaveBuffer={onSaveBuffer}
        onToggleOpen={onToggleOpen}
        onToggleActive={onToggleActive}
        onDelete={onDelete}
        onRecalculate={() => onRecalculate("urban")}
      />
      <CellTable
        title="Rural"
        cell={row.rural}
        editBuffer={editBuffer}
        onBufferChange={onBufferChange}
        onSaveBuffer={onSaveBuffer}
        onToggleOpen={onToggleOpen}
        onToggleActive={onToggleActive}
        onDelete={onDelete}
        onRecalculate={() => onRecalculate("rural")}
      />
    </div>
  );
}

function CellTable({
  title,
  cell,
  editBuffer,
  onBufferChange,
  onSaveBuffer,
  onToggleOpen,
  onToggleActive,
  onDelete,
  onRecalculate,
}: {
  title: string;
  cell: QuotaSnapshot["states"][number]["urban"];
  editBuffer: Record<string, string>;
  onBufferChange: (cityId: string, value: string) => void;
  onSaveBuffer: (cityId: string, current: number) => void;
  onToggleOpen: (cityId: string, isOpen: boolean) => void;
  onToggleActive: (cityId: string, isActive: boolean) => void;
  onDelete: (cityId: string) => void;
  onRecalculate: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
          {title} · {cell.achieved}/{cell.allocation}
          {cell.delta ? ` · Δ${cell.delta}` : ""}
          {cell.daysSinceLastCompletion != null
            ? ` · ${cell.daysSinceLastCompletion}d since last complete`
            : " · no completes yet"}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onRecalculate}>
          Recalculate targets
        </Button>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              <th className="py-2 pr-3">City</th>
              <th className="py-2 pr-3">Target</th>
              <th className="py-2 pr-3">Buffer</th>
              <th className="py-2 pr-3">Closes at</th>
              <th className="py-2 pr-3">Achieved</th>
              <th className="py-2 pr-3">Remaining</th>
              <th className="py-2 pr-3">% full</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cell.cities.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-3 text-text-muted">
                  No cities in this cell.
                </td>
              </tr>
            ) : (
              cell.cities.map((city) => (
                <tr key={city.id} className="border-b border-border/70">
                  <td className="py-3 pr-3 font-medium text-text-primary">{city.name}</td>
                  <td className="py-3 pr-3 font-mono tabular-nums">{city.target}</td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        className="h-9 w-20"
                        value={editBuffer[city.id] ?? String(city.buffer)}
                        onChange={(event) => onBufferChange(city.id, event.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          editBuffer[city.id] !== undefined &&
                          Number(editBuffer[city.id]) !== city.buffer
                            ? "default"
                            : "outline"
                        }
                        onClick={() => onSaveBuffer(city.id, city.buffer)}
                      >
                        Save
                      </Button>
                    </div>
                  </td>
                  <td className="py-3 pr-3 font-mono tabular-nums">{city.closesAt}</td>
                  <td className="py-3 pr-3 font-mono tabular-nums">{city.achieved}</td>
                  <td className="py-3 pr-3 font-mono tabular-nums">{city.remaining}</td>
                  <td className="py-3 pr-3 font-mono tabular-nums">{city.pctFull}%</td>
                  <td className="py-3 pr-3">
                    <span className={city.isActive ? "text-primary" : "text-text-muted"}>
                      {city.isActive ? "Active" : "Inactive"}
                    </span>
                    {" · "}
                    <span className={city.isOpen ? "text-primary" : "text-text-muted"}>
                      {city.isOpen ? "Open" : "Closed"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onToggleOpen(city.id, !city.isOpen)}
                      >
                        {city.isOpen ? "Close" : "Open"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onToggleActive(city.id, !city.isActive)}
                      >
                        {city.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => onDelete(city.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
