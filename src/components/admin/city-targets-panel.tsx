"use client";

import { ChevronDownIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { UnmatchedCitiesPanel } from "@/components/admin/unmatched-cities-panel";
import {
  INDIA_REGIONS,
  INDIA_STATES,
  INDIA_UTS,
  quotaCellId,
  type AreaType,
} from "@/lib/india-states";
import type { QuotaCellRow, QuotaSnapshot, QuotaStateRow } from "@/lib/quota/types";
import type {
  IgnoredUnmatchedRow,
  UnmatchedCityRow,
} from "@/lib/unmatched-city-types";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastSuccess,
} from "@/lib/toast";

type SnapshotPayload = QuotaSnapshot & {
  regions?: string[];
  error?: string;
  unmatchedCities?: UnmatchedCityRow[];
  unmatchedGlobalCompletes?: number;
  ignoredUnmatched?: IgnoredUnmatchedRow[];
};

export function CityTargetsPanel({
  totalCapacity,
  enforceCapacity = false,
  onCapacityHintChange,
}: {
  totalCapacity: number;
  enforceCapacity?: boolean;
  onCapacityHintChange?: (stateAllocationSum: number) => void;
}) {
  const [payload, setPayload] = useState<SnapshotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [editAlloc, setEditAlloc] = useState<Record<string, string>>({});
  const [editUrbanPct, setEditUrbanPct] = useState<Record<string, string>>({});
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({});
  const [editCapacity, setEditCapacity] = useState<Record<string, string>>({});
  const [expandedState, setExpandedState] = useState<string | null>(null);
  const [expandAllStates, setExpandAllStates] = useState(false);
  const [cityFilter, setCityFilter] = useState("");
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

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/cities");
    const data = (await response.json()) as SnapshotPayload;
    if (!response.ok) throw new Error(data.error ?? "Failed to load City Targets.");
    setPayload(data);
    setEditAlloc({});
    setEditUrbanPct({});
    setEditBuffer({});
    setEditCapacity({});
    onCapacityHintChange?.(data.stateAllocationSum);
    setExpandedState((current) => {
      if (current && data.states.some((row) => row.state === current)) {
        return current;
      }
      return data.states[0]?.state ?? null;
    });
  }, [onCapacityHintChange]);

  useEffect(() => {
    void load()
      .catch((error: unknown) => {
        toastError(error instanceof Error ? error.message : "Failed to load City Targets.");
      })
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!payload?.states.length) return;
    setExpandedState((current) => {
      if (current && payload.states.some((row) => row.state === current)) {
        return current;
      }
      return payload.states[0]?.state ?? null;
    });
  }, [payload]);

  const displayStates = useMemo(
    () => (payload ? allIndiaStateRows(payload) : []),
    [payload],
  );

  useEffect(() => {
    const query = cityFilter.trim().toLowerCase();
    if (!query || displayStates.length === 0) return;
    const match = displayStates.find(
      (row) =>
        row.state.toLowerCase().includes(query) ||
        [...row.urban.cities, ...row.rural.cities].some((city) =>
          city.name.toLowerCase().includes(query),
        ),
    );
    if (match) {
      setExpandAllStates(false);
      setExpandedState(match.state);
    }
  }, [cityFilter, displayStates]);

  const cellOptions = useMemo(() => {
    if (!payload) return [];
    return payload.states.flatMap((row) => [
      `${row.state}|urban`,
      `${row.state}|rural`,
    ]);
  }, [payload]);

  const configCityOptions = useMemo(() => {
    if (!payload) return [];
    return payload.states.flatMap((row) =>
      [...row.urban.cities, ...row.rural.cities].map((city) => ({
        id: city.id,
        name: city.name,
        state: city.state,
        areaType: city.areaType,
      })),
    );
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

  async function saveCapacity(cityId: string, current: number) {
    const next = Math.max(0, Number(editCapacity[cityId] ?? current) || 0);
    const loadingId = toastLoading("Saving capacity…");
    try {
      const response = await fetch(`/api/admin/cities/${cityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacity: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Failed to save capacity.");
      await load();
      dismissToast(loadingId);
      toastSuccess("Reference saved.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Failed to save capacity.");
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
        state</strong>. Numbers below are <strong>reference targets</strong>
        {enforceCapacity ? " and hard limits while enforcement is on" : ", not hard caps"}.
        National estimates need weights. Status is Achieved / Reference only.
        Gender quota is not applied.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-plum-muted">
        Q15_1 / Q15_2 are self-report and never drive these cells. Respondents type
        a free-text city; the server resolves it to this list (exact, then alias).
        Unmatched completes still count toward the <strong>study total</strong>.
      </p>

      <div className="mt-4 rounded-[12px] border border-primary/30 bg-accent-soft px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
          Live study total
        </p>
        <p className="mt-1 font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground">
          {payload?.achievedGlobal ?? 0}
        </p>
        <p className="mt-1 text-sm text-text-primary">
          qualified completes · urban {payload?.achievedUrban ?? 0} : rural{" "}
          {payload?.achievedRural ?? 0}
          {payload?.unweightedUrbanPct == null
            ? ""
            : ` · ${payload.unweightedUrbanPct}% urban (${payload.skewPoints ?? 0} pts vs 50)`}
        </p>
        <p className="mt-1 text-xs text-plum-muted">
          Close the form manually when this total looks right (around 200–230).
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Study reference" value={String(payload?.totalCapacity ?? totalCapacity)} />
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
          label="Qualified completes"
          value={`${payload?.achievedGlobal ?? 0} · U ${payload?.achievedUrban ?? 0} / R ${payload?.achievedRural ?? 0}`}
        />
      </div>

      {payload?.cellWarning ? (
        <p
          className={`mt-4 rounded-[10px] border px-3 py-2 text-sm ${
            enforceCapacity
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-accent-soft text-plum-muted"
          }`}
        >
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

      {loading ? (
        <p className="mt-6 text-sm text-text-muted">Loading City Targets…</p>
      ) : !payload ? (
        <p className="mt-6 text-sm text-text-muted">
          Could not load City Targets. Retry or check the cities API error.
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-[220px] flex-1">
              <p className="text-sm text-plum-muted">
                All {INDIA_REGIONS.length} India states and UTs are listed (
                {INDIA_STATES.length} states · {INDIA_UTS.length} UTs).{" "}
                {payload.states.length} currently have cities — quota is split only
                across those. Click a card to view cities.
              </p>
              <label className="mt-2 block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-plum-faint">
                  Filter states or cities
                </span>
                <Input
                  className="mt-1 h-9"
                  placeholder="Search by state or city name…"
                  value={cityFilter}
                  onChange={(event) => setCityFilter(event.target.value)}
                />
              </label>
            </div>
            <Button
              type="button"
              size="sm"
              variant={expandAllStates ? "default" : "outline"}
              onClick={() => {
                setExpandAllStates((current) => !current);
                if (!expandAllStates) {
                  setExpandedState(
                    payload.states[0]?.state ?? INDIA_REGIONS[0],
                  );
                }
              }}
            >
              {expandAllStates ? "Accordion view" : "Expand all states"}
            </Button>
          </div>
          {displayStates.map((row) => (
            <StateBlock
              key={row.state}
              row={row}
              globalUrbanPct={payload.urbanPct}
              enforceCapacity={enforceCapacity}
              expanded={expandAllStates || expandedState === row.state}
              cityFilter={cityFilter.trim().toLowerCase()}
              editAlloc={editAlloc[row.state] ?? String(row.allocation)}
              editUrbanPct={editUrbanPct[row.state] ?? String(row.urbanPct)}
              editBuffer={editBuffer}
              editCapacity={editCapacity}
              onToggleExpand={() => {
                setExpandAllStates(false);
                setExpandedState(row.state);
              }}
              onAllocChange={(value) =>
                setEditAlloc((current) => ({ ...current, [row.state]: value }))
              }
              onUrbanPctChange={(value) =>
                setEditUrbanPct((current) => ({ ...current, [row.state]: value }))
              }
              onBufferChange={(cityId, value) =>
                setEditBuffer((current) => ({ ...current, [cityId]: value }))
              }
              onCapacityChange={(cityId, value) =>
                setEditCapacity((current) => ({ ...current, [cityId]: value }))
              }
              onSaveQuota={() => void saveStateQuota(row)}
              onSaveBuffer={(cityId, current) => void saveBuffer(cityId, current)}
              onSaveCapacity={(cityId, current) => void saveCapacity(cityId, current)}
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
          ))}
        </>
      )}

      <UnmatchedCitiesPanel
        unmatched={payload?.unmatchedCities ?? []}
        ignored={payload?.ignoredUnmatched ?? []}
        unmatchedGlobal={payload?.unmatchedGlobalCompletes ?? 0}
        regions={payload?.regions ?? []}
        cities={configCityOptions}
        enforceCapacity={enforceCapacity}
        onRefresh={load}
      />

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

const UT_SET = new Set<string>(INDIA_UTS);

function isUnionTerritory(state: string): boolean {
  return UT_SET.has(state);
}

function emptyCell(state: string, areaType: AreaType): QuotaCellRow {
  return {
    state,
    areaType,
    cellId: quotaCellId(state, areaType),
    allocation: 0,
    delta: 0,
    achieved: 0,
    remaining: 0,
    pctFull: 0,
    closesAtSum: 0,
    daysSinceLastCompletion: null,
    cities: [],
  };
}

function emptyStateRow(state: string, urbanPct: number): QuotaStateRow {
  return {
    state,
    allocation: 0,
    allocationManual: false,
    urbanPct,
    urbanPctManual: false,
    achieved: 0,
    remaining: 0,
    pctFull: 0,
    urban: emptyCell(state, "urban"),
    rural: emptyCell(state, "rural"),
  };
}

function allIndiaStateRows(payload: SnapshotPayload): QuotaStateRow[] {
  const byState = new Map(payload.states.map((row) => [row.state, row]));
  const listed = INDIA_REGIONS.map(
    (region) => byState.get(region) ?? emptyStateRow(region, payload.urbanPct),
  );
  const extras = payload.states.filter(
    (row) => !(INDIA_REGIONS as readonly string[]).includes(row.state),
  );
  return [...listed, ...extras];
}

function StateBlock({
  row,
  globalUrbanPct,
  enforceCapacity,
  expanded,
  cityFilter,
  editAlloc,
  editUrbanPct,
  editBuffer,
  editCapacity,
  onToggleExpand,
  onAllocChange,
  onUrbanPctChange,
  onSaveQuota,
  onSaveBuffer,
  onSaveCapacity,
  onBufferChange,
  onCapacityChange,
  onToggleOpen,
  onToggleActive,
  onDelete,
  onRecalculate,
}: {
  row: QuotaStateRow;
  globalUrbanPct: number;
  enforceCapacity: boolean;
  expanded: boolean;
  cityFilter: string;
  editAlloc: string;
  editUrbanPct: string;
  editBuffer: Record<string, string>;
  editCapacity: Record<string, string>;
  onToggleExpand: () => void;
  onAllocChange: (value: string) => void;
  onUrbanPctChange: (value: string) => void;
  onSaveQuota: () => void;
  onSaveBuffer: (cityId: string, current: number) => void;
  onSaveCapacity: (cityId: string, current: number) => void;
  onBufferChange: (cityId: string, value: string) => void;
  onCapacityChange: (cityId: string, value: string) => void;
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
  const cityCount = row.urban.cities.length + row.rural.cities.length;
  const allCities = [...row.urban.cities, ...row.rural.cities];
  const cityPreview = allCities
    .slice(0, 6)
    .map((city) => city.name)
    .join(", ");
  const matchesFilter =
    !cityFilter ||
    row.state.toLowerCase().includes(cityFilter) ||
    [...row.urban.cities, ...row.rural.cities].some((city) =>
      city.name.toLowerCase().includes(cityFilter),
    );

  if (cityFilter && !matchesFilter) {
    return null;
  }

  return (
    <div
      className={`mt-4 rounded-[12px] border p-4 transition-colors ${
        expanded ? "border-primary/40 bg-card" : "border-border bg-accent-soft/30"
      }`}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-start justify-between gap-3 text-left"
        aria-expanded={expanded}
        onClick={onToggleExpand}
      >
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-foreground">
            {row.state}
            {isUnionTerritory(row.state) ? (
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-plum-faint">
                UT
              </span>
            ) : null}
          </h4>
          <p className="mt-1 text-xs text-plum-muted">
            {cityCount === 0
              ? "No cities imported yet · not in quota split"
              : `${row.achieved}/${row.allocation} · ${row.pctFull}% of reference · ${cityCount} ${
                  cityCount === 1 ? "city" : "cities"
                } · urban split ${balance}${
                  row.urbanPctManual ? " (override)" : ` (global ${globalUrbanPct}%)`
                }${row.allocationManual ? " · alloc override" : " · equal split"}`}
          </p>
          {!expanded && cityCount > 0 ? (
            <p className="mt-1 text-[11px] text-text-muted">
              Urban {row.urban.achieved}/{row.urban.allocation} · Rural{" "}
              {row.rural.achieved}/{row.rural.allocation}
              {cityPreview ? (
                <>
                  {" "}
                  · {cityPreview}
                  {cityCount > 6 ? ` … +${cityCount - 6} more` : ""}
                </>
              ) : null}
            </p>
          ) : null}
          {!expanded ? (
            <p className="mt-1 text-[11px] font-medium text-primary">
              {cityCount > 0
                ? `Click to view ${cityCount} ${cityCount === 1 ? "city" : "cities"}`
                : "Click to open this state/UT"}
            </p>
          ) : null}
        </div>
        <ChevronDownIcon
          className={`mt-0.5 h-5 w-5 shrink-0 text-plum-muted transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="mt-4 border-t border-border/70 pt-4">
          {cityCount === 0 ? (
            <p className="text-sm text-plum-muted">
              No cities for {row.state} yet. Import a city file or resolve an
              unmatched city into this region to open its quota cell.
            </p>
          ) : (
            <>
          <div
            className="flex flex-wrap items-end justify-between gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-xs text-plum-muted">
              Edit allocation, urban split, and city targets for this state.
            </p>
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
              <Button
                type="button"
                size="sm"
                variant={dirty ? "default" : "outline"}
                onClick={onSaveQuota}
              >
                Save quota
              </Button>
            </div>
          </div>

          <CellTable
            title="Urban"
            cell={row.urban}
            cityFilter={cityFilter}
            enforceCapacity={enforceCapacity}
            editBuffer={editBuffer}
            editCapacity={editCapacity}
            onBufferChange={onBufferChange}
            onCapacityChange={onCapacityChange}
            onSaveBuffer={onSaveBuffer}
            onSaveCapacity={onSaveCapacity}
            onToggleOpen={onToggleOpen}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
            onRecalculate={() => onRecalculate("urban")}
          />
          <CellTable
            title="Rural"
            cell={row.rural}
            cityFilter={cityFilter}
            enforceCapacity={enforceCapacity}
            editBuffer={editBuffer}
            editCapacity={editCapacity}
            onBufferChange={onBufferChange}
            onCapacityChange={onCapacityChange}
            onSaveBuffer={onSaveBuffer}
            onSaveCapacity={onSaveCapacity}
            onToggleOpen={onToggleOpen}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
            onRecalculate={() => onRecalculate("rural")}
          />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CellTable({
  title,
  cell,
  cityFilter,
  enforceCapacity,
  editBuffer,
  editCapacity,
  onBufferChange,
  onCapacityChange,
  onSaveBuffer,
  onSaveCapacity,
  onToggleOpen,
  onToggleActive,
  onDelete,
  onRecalculate,
}: {
  title: string;
  cell: QuotaSnapshot["states"][number]["urban"];
  cityFilter: string;
  enforceCapacity: boolean;
  editBuffer: Record<string, string>;
  editCapacity: Record<string, string>;
  onBufferChange: (cityId: string, value: string) => void;
  onCapacityChange: (cityId: string, value: string) => void;
  onSaveBuffer: (cityId: string, current: number) => void;
  onSaveCapacity: (cityId: string, current: number) => void;
  onToggleOpen: (cityId: string, isOpen: boolean) => void;
  onToggleActive: (cityId: string, isActive: boolean) => void;
  onDelete: (cityId: string) => void;
  onRecalculate: () => void;
}) {
  const cities = cityFilter
    ? cell.cities.filter((city) => city.name.toLowerCase().includes(cityFilter))
    : cell.cities;

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
              <th className="py-2 pr-3">Reference target</th>
              <th className="py-2 pr-3">Buffer</th>
              <th className="py-2 pr-3">Reference</th>
              <th className="py-2 pr-3">Achieved</th>
              <th className="py-2 pr-3">Vs reference</th>
              <th className="py-2 pr-3">% of reference</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cities.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-3 text-text-muted">
                  {cell.cities.length === 0
                    ? "No cities in this cell."
                    : "No cities match the filter in this cell."}
                </td>
              </tr>
            ) : (
              cities.map((city) => {
                const overReference = city.achieved > city.closesAt;
                return (
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
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        className="h-9 w-20"
                        value={editCapacity[city.id] ?? String(city.closesAt)}
                        onChange={(event) => onCapacityChange(city.id, event.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          editCapacity[city.id] !== undefined &&
                          Number(editCapacity[city.id]) !== city.closesAt
                            ? "default"
                            : "outline"
                        }
                        onClick={() => onSaveCapacity(city.id, city.closesAt)}
                      >
                        Save
                      </Button>
                    </div>
                  </td>
                  <td className="py-3 pr-3 font-mono tabular-nums">{city.achieved}</td>
                  <td className="py-3 pr-3 font-mono tabular-nums text-text-primary">
                    {overReference
                      ? `Over by ${city.achieved - city.closesAt}`
                      : city.remaining}
                  </td>
                  <td className="py-3 pr-3 font-mono tabular-nums">{city.pctFull}%</td>
                  <td className="py-3 pr-3">
                    <span className={city.isActive ? "text-primary" : "text-text-muted"}>
                      {city.isActive ? "Active" : "Inactive"}
                    </span>
                    {overReference ? (
                      <>
                        {" · "}
                        <span className="text-text-muted">Over reference</span>
                      </>
                    ) : null}
                    {enforceCapacity ? (
                      <>
                        {" · "}
                        <span className={city.isOpen ? "text-primary" : "text-text-muted"}>
                          {city.isOpen ? "Open" : "Closed"}
                        </span>
                      </>
                    ) : (
                      <>
                        {" · "}
                        <span className="text-text-muted">Auto-close off</span>
                      </>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      {enforceCapacity ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onToggleOpen(city.id, !city.isOpen)}
                      >
                        {city.isOpen ? "Close" : "Open"}
                      </Button>
                      ) : null}
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
