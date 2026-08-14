"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { normalizeCityDisplayName } from "@/lib/city-resolve";
import type { AreaType } from "@/lib/india-states";
import type {
  IgnoredUnmatchedRow,
  ResolvePreview,
  UnmatchedCityRow,
} from "@/lib/unmatched-city-types";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastSuccess,
} from "@/lib/toast";

type CityOption = {
  id: string;
  name: string;
  state: string;
  areaType: AreaType;
};

type PendingResolution = {
  matchKey: string;
  action: "add_city" | "alias";
  cityId?: string;
  name?: string;
  state?: string;
  areaType?: AreaType;
  capacity?: number;
};

export function UnmatchedCitiesPanel({
  unmatched,
  ignored,
  unmatchedGlobal,
  regions,
  cities,
  enforceCapacity = false,
  onRefresh,
}: {
  unmatched: UnmatchedCityRow[];
  ignored: IgnoredUnmatchedRow[];
  unmatchedGlobal: number;
  regions: string[];
  cities: CityOption[];
  enforceCapacity?: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [addForms, setAddForms] = useState<
    Record<string, { name: string; state: string; areaType: AreaType; capacity: string }>
  >({});
  const [aliasForms, setAliasForms] = useState<
    Record<string, { cityId: string; search: string }>
  >({});
  const [bulkState, setBulkState] = useState("");
  const [bulkArea, setBulkArea] = useState<AreaType>("urban");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<ResolvePreview | null>(null);
  const [pendingResolutions, setPendingResolutions] = useState<PendingResolution[]>(
    [],
  );
  const [showIgnored, setShowIgnored] = useState(false);

  const filteredCities = useMemo(() => {
    return cities.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [cities]);

  function toggleSelected(matchKey: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(matchKey)) next.delete(matchKey);
      else next.add(matchKey);
      return next;
    });
  }

  function initAddForm(row: UnmatchedCityRow) {
    setAddForms((current) => ({
      ...current,
      [row.matchKey]: {
        name: normalizeCityDisplayName(row.raw),
        state: current[row.matchKey]?.state ?? "",
        areaType: current[row.matchKey]?.areaType ?? "urban",
        capacity: current[row.matchKey]?.capacity ?? "0",
      },
    }));
    setExpandedKey(`${row.matchKey}:add`);
  }

  function initAliasForm(row: UnmatchedCityRow, cityId?: string) {
    setAliasForms((current) => ({
      ...current,
      [row.matchKey]: {
        cityId: cityId ?? current[row.matchKey]?.cityId ?? "",
        search: current[row.matchKey]?.search ?? "",
      },
    }));
    setExpandedKey(`${row.matchKey}:alias`);
  }

  function cityPickerOptions(search: string) {
    const q = search.trim().toLowerCase();
    return filteredCities.filter((city) => {
      if (!q) return true;
      return (
        city.name.toLowerCase().includes(q) ||
        city.state.toLowerCase().includes(q)
      );
    });
  }

  async function runPreview(resolutions: PendingResolution[]) {
    const loadingId = toastLoading("Computing recount preview…");
    try {
      const response = await fetch("/api/admin/cities/unmatched/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutions }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Preview failed.");
      setPendingResolutions(resolutions);
      setPreview(data.preview as ResolvePreview);
      setPreviewOpen(true);
      dismissToast(loadingId);
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Preview failed.");
    }
  }

  async function commitResolve(
    overQuotaDecision?: "raise_city_capacity" | "proceed_over_quota",
  ) {
    const loadingId = toastLoading("Applying resolution…");
    try {
      const response = await fetch("/api/admin/cities/unmatched/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolutions: pendingResolutions,
          overQuotaDecision,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === "OVER_QUOTA_DECISION_REQUIRED") {
          dismissToast(loadingId);
          return;
        }
        throw new Error(data.error ?? "Resolve failed.");
      }
      setPreviewOpen(false);
      setPreview(null);
      setPendingResolutions([]);
      setSelected(new Set());
      setExpandedKey(null);
      await onRefresh();
      dismissToast(loadingId);
      toastSuccess("Unmatched city resolved and responses recounted.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Resolve failed.");
    }
  }

  async function ignoreRow(row: UnmatchedCityRow) {
    const loadingId = toastLoading("Ignoring…");
    try {
      const response = await fetch("/api/admin/cities/unmatched/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchKey: row.matchKey,
          sampleRaw: row.raw,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Ignore failed.");
      await onRefresh();
      dismissToast(loadingId);
      toastSuccess("Marked as ignored.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Ignore failed.");
    }
  }

  async function restoreIgnored(row: IgnoredUnmatchedRow) {
    const loadingId = toastLoading("Restoring…");
    try {
      const response = await fetch("/api/admin/cities/unmatched/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchKey: row.matchKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Restore failed.");
      await onRefresh();
      dismissToast(loadingId);
      toastSuccess("Restored to unmatched list.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Restore failed.");
    }
  }

  function submitAdd(row: UnmatchedCityRow) {
    const form = addForms[row.matchKey];
    if (!form?.state) {
      toastError("State is required.");
      return;
    }
    void runPreview([
      {
        matchKey: row.matchKey,
        action: "add_city",
        name: form.name,
        state: form.state,
        areaType: form.areaType,
        capacity: Math.max(0, Number(form.capacity) || 0),
      },
    ]);
  }

  function submitAlias(row: UnmatchedCityRow) {
    const form = aliasForms[row.matchKey];
    if (!form?.cityId) {
      toastError("Select a target city.");
      return;
    }
    void runPreview([
      {
        matchKey: row.matchKey,
        action: "alias",
        cityId: form.cityId,
      },
    ]);
  }

  function submitBulkAdd() {
    if (!bulkState) {
      toastError("State is required for bulk add.");
      return;
    }
    const keys = bulkMode ? [...selected] : [];
    if (keys.length === 0) {
      toastError("Select at least one row.");
      return;
    }
    const resolutions: PendingResolution[] = keys.map((matchKey) => {
      const row = unmatched.find((item) => item.matchKey === matchKey);
      const form = addForms[matchKey];
      return {
        matchKey,
        action: "add_city" as const,
        name: form?.name ?? normalizeCityDisplayName(row?.raw ?? matchKey),
        state: bulkState,
        areaType: bulkArea,
        capacity: Math.max(0, Number(form?.capacity) || 0),
      };
    });
    void runPreview(resolutions);
  }

  async function bulkIgnore() {
    const keys = [...selected];
    if (keys.length === 0) return;
    const loadingId = toastLoading("Ignoring selected…");
    try {
      for (const matchKey of keys) {
        const row = unmatched.find((item) => item.matchKey === matchKey);
        if (!row) continue;
        const response = await fetch("/api/admin/cities/unmatched/ignore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchKey, sampleRaw: row.raw }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Bulk ignore failed.");
        }
      }
      setSelected(new Set());
      await onRefresh();
      dismissToast(loadingId);
      toastSuccess(`Ignored ${keys.length} entries.`);
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Bulk ignore failed.");
    }
  }

  return (
    <div className="mt-5 rounded-[12px] border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Unmatched cities</h4>
          <p className="mt-1 text-xs leading-relaxed text-plum-muted">
            Completes that typed a city not in config. They still count toward the{" "}
            <strong>study total</strong> ({unmatchedGlobal} unmatched completes).
            Resolve inline to recount into the correct cell.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBulkMode((value) => !value)}
        >
          {bulkMode ? "Exit bulk" : "Bulk mode"}
        </Button>
      </div>

      {bulkMode ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-plum-muted">State (all selected)</span>
            <Select value={bulkState} onChange={(e) => setBulkState(e.target.value)}>
              <option value="">Select state…</option>
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-plum-muted">Area type</span>
            <Select
              value={bulkArea}
              onChange={(e) => setBulkArea(e.target.value as AreaType)}
            >
              <option value="urban">Urban</option>
              <option value="rural">Rural</option>
            </Select>
          </label>
          <Button type="button" size="sm" onClick={submitBulkAdd} disabled={!selected.size}>
            Add selected as new cities
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void bulkIgnore()}
            disabled={!selected.size}
          >
            Ignore selected
          </Button>
        </div>
      ) : null}

      {unmatched.length === 0 ? (
        <p className="mt-2 text-xs text-text-muted">No unmatched completes pending review.</p>
      ) : (
        <ul className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto">
          {unmatched.map((row) => (
            <li
              key={row.matchKey}
              className="rounded-md border border-border/80 p-3 text-xs text-plum-muted"
            >
              <div className="flex flex-wrap items-start gap-2">
                {bulkMode ? (
                  <input
                    type="checkbox"
                    checked={selected.has(row.matchKey)}
                    onChange={() => toggleSelected(row.matchKey)}
                    className="mt-1"
                    aria-label={`Select ${row.raw}`}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{row.raw}</p>
                  <p className="mt-0.5">
                    Normalised: <code className="text-[11px]">{row.normalized}</code>
                    {row.rawVariants.length > 1 ? (
                      <span className="ml-2 text-text-muted">
                        Variants: {row.rawVariants.join(" · ")}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5">
                    {row.count} complete{row.count === 1 ? "" : "s"}
                  </p>
                  {row.suggestions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-text-muted">Likely matches:</span>
                      {row.suggestions.map((s) => (
                        <button
                          key={`${row.matchKey}-${s.cityId}`}
                          type="button"
                          className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
                          onClick={() => initAliasForm(row, s.cityId)}
                        >
                          {s.name} ({s.state}) · {s.score}%
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {!bulkMode ? (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => initAddForm(row)}
                    >
                      Add as new city
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => initAliasForm(row)}
                    >
                      Map to existing
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void ignoreRow(row)}
                    >
                      Ignore
                    </Button>
                  </div>
                ) : null}
              </div>

              {expandedKey === `${row.matchKey}:add` ? (
                <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span>Canonical city name</span>
                    <Input
                      value={addForms[row.matchKey]?.name ?? ""}
                      onChange={(e) =>
                        setAddForms((current) => ({
                          ...current,
                          [row.matchKey]: {
                            ...current[row.matchKey],
                            name: e.target.value,
                            state: current[row.matchKey]?.state ?? "",
                            areaType: current[row.matchKey]?.areaType ?? "urban",
                            capacity: current[row.matchKey]?.capacity ?? "0",
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>State *</span>
                    <Select
                      value={addForms[row.matchKey]?.state ?? ""}
                      onChange={(e) =>
                        setAddForms((current) => ({
                          ...current,
                          [row.matchKey]: {
                            ...current[row.matchKey],
                            name: current[row.matchKey]?.name ?? row.raw,
                            state: e.target.value,
                            areaType: current[row.matchKey]?.areaType ?? "urban",
                            capacity: current[row.matchKey]?.capacity ?? "0",
                          },
                        }))
                      }
                    >
                      <option value="">Select state…</option>
                      {regions.map((region) => (
                        <option key={region} value={region}>
                          {region}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>Area type *</span>
                    <Select
                      value={addForms[row.matchKey]?.areaType ?? "urban"}
                      onChange={(e) =>
                        setAddForms((current) => ({
                          ...current,
                          [row.matchKey]: {
                            ...current[row.matchKey],
                            name: current[row.matchKey]?.name ?? row.raw,
                            state: current[row.matchKey]?.state ?? "",
                            areaType: e.target.value as AreaType,
                            capacity: current[row.matchKey]?.capacity ?? "0",
                          },
                        }))
                      }
                    >
                      <option value="urban">Urban</option>
                      <option value="rural">Rural</option>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>Reference (optional)</span>
                    <Input
                      type="number"
                      min={0}
                      value={addForms[row.matchKey]?.capacity ?? "0"}
                      onChange={(e) =>
                        setAddForms((current) => ({
                          ...current,
                          [row.matchKey]: {
                            ...current[row.matchKey],
                            name: current[row.matchKey]?.name ?? row.raw,
                            state: current[row.matchKey]?.state ?? "",
                            areaType: current[row.matchKey]?.areaType ?? "urban",
                            capacity: e.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button type="button" size="sm" onClick={() => submitAdd(row)}>
                      Preview &amp; confirm
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedKey(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {expandedKey === `${row.matchKey}:alias` ? (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <label className="flex flex-col gap-1">
                    <span>Search config cities</span>
                    <Input
                      value={aliasForms[row.matchKey]?.search ?? ""}
                      onChange={(e) =>
                        setAliasForms((current) => ({
                          ...current,
                          [row.matchKey]: {
                            cityId: current[row.matchKey]?.cityId ?? "",
                            search: e.target.value,
                          },
                        }))
                      }
                      placeholder="Type city or state…"
                    />
                  </label>
                  <Select
                    value={aliasForms[row.matchKey]?.cityId ?? ""}
                    onChange={(e) =>
                      setAliasForms((current) => ({
                        ...current,
                        [row.matchKey]: {
                          cityId: e.target.value,
                          search: current[row.matchKey]?.search ?? "",
                        },
                      }))
                    }
                  >
                    <option value="">Select target city…</option>
                    {cityPickerOptions(aliasForms[row.matchKey]?.search ?? "").map(
                      (city) => (
                        <option key={city.id} value={city.id}>
                          {city.name} · {city.state} · {city.areaType}
                        </option>
                      ),
                    )}
                  </Select>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => submitAlias(row)}>
                      Preview &amp; confirm
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedKey(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {ignored.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
            onClick={() => setShowIgnored((value) => !value)}
          >
            {showIgnored ? "Hide" : "Show"} ignored ({ignored.length})
          </button>
          {showIgnored ? (
            <ul className="mt-2 space-y-1 text-xs text-plum-muted">
              {ignored.map((row) => (
                <li key={row.matchKey} className="flex flex-wrap items-center gap-2">
                  <span>{row.sampleRaw}</span>
                  <span>· {row.responseCount} completes</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void restoreIgnored(row)}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Confirm recount</DialogTitle>
            <DialogDescription>
              {preview?.totalResponses ?? 0} response(s) will move from global-only into
              quota cells. Review every change before committing.
            </DialogDescription>
          </DialogHeader>

          {preview ? (
            <div className="space-y-3 text-xs">
              <div>
                <p className="font-medium text-foreground">Resolutions</p>
                <ul className="mt-1 space-y-1 text-plum-muted">
                  {preview.items.map((item) => (
                    <li key={item.matchKey}>
                      <code>{item.sampleRaw}</code> → {item.targetCityName} (
                      {item.action === "alias" ? "alias" : "new city"}) ·{" "}
                      {item.responseCount} response(s)
                    </li>
                  ))}
                </ul>
              </div>

              {preview.cells.length > 0 ? (
                <div>
                  <p className="font-medium text-foreground">Cell impact</p>
                  <ul className="mt-1 space-y-1">
                    {preview.cells.map((cell) => (
                      <li
                        key={cell.cellId}
                        className={
                          enforceCapacity && cell.overBy > 0
                            ? "text-destructive"
                            : "text-plum-muted"
                        }
                      >
                        {cell.state} · {cell.areaType}: {cell.currentAchieved} +{" "}
                        {cell.incoming} = {cell.afterAchieved} / {cell.allocation}
                        {cell.overBy > 0 ? ` (over by ${cell.overBy})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.cities.length > 0 ? (
                <div>
                  <p className="font-medium text-foreground">City impact</p>
                  <ul className="mt-1 space-y-1">
                    {preview.cities.map((city) => (
                      <li
                        key={city.cityId}
                        className={
                          enforceCapacity && city.overBy > 0
                            ? "text-destructive"
                            : "text-plum-muted"
                        }
                      >
                        {city.cityName}: {city.currentAchieved} + {city.incoming} ={" "}
                        {city.afterAchieved}
                        {city.closesAt > 0 ? ` / ${city.closesAt}` : ""}
                        {city.overBy > 0 ? ` (over by ${city.overBy})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.hasOverage && enforceCapacity ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <p className="font-medium text-destructive">
                    This resolution exceeds at least one allocation.
                  </p>
                  <p className="mt-1 text-plum-muted">
                    Choose how to proceed — nothing is saved until you confirm.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void commitResolve("raise_city_capacity")}
                    >
                      Raise city Closes At
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void commitResolve("proceed_over_quota")}
                    >
                      Proceed &amp; flag cell over-quota
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPreviewOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-2">
                  {preview.hasOverage && !enforceCapacity ? (
                    <p className="mb-2 w-full text-plum-muted">
                      After recount, at least one cell or city will be over its
                      reference number. That is expected while enforcement is
                      off.
                    </p>
                  ) : null}
                  <Button type="button" size="sm" onClick={() => void commitResolve()}>
                    Confirm &amp; recount
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPreviewOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
