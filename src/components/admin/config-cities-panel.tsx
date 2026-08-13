"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CityAreaType, CityWithCapacity } from "@/server/repositories/cities.repository";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastSuccess,
} from "@/lib/toast";

type CitiesPayload = {
  cities: CityWithCapacity[];
  totalCapacity: number;
  activeCityCapacitySum: number;
  unallocated: number;
};

export function ConfigCitiesPanel({
  totalCapacity,
  onCapacityHintChange,
}: {
  totalCapacity: number;
  onCapacityHintChange?: (activeSum: number) => void;
}) {
  const [payload, setPayload] = useState<CitiesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [areaType, setAreaType] = useState<CityAreaType>("urban");
  const [capacity, setCapacity] = useState(0);
  const [editCapacity, setEditCapacity] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/cities");
    const data = (await response.json()) as CitiesPayload & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Failed to load cities.");
    setPayload(data);
    setEditCapacity({});
    onCapacityHintChange?.(data.activeCityCapacitySum);
  }, [onCapacityHintChange]);

  useEffect(() => {
    void load()
      .catch((error: unknown) => {
        toastError(error instanceof Error ? error.message : "Failed to load cities.");
      })
      .finally(() => setLoading(false));
  }, [load]);

  const unallocated = useMemo(() => {
    if (!payload) return totalCapacity;
    return totalCapacity - payload.activeCityCapacitySum;
  }, [payload, totalCapacity]);

  async function addCity() {
    const loadingId = toastLoading("Adding city…");
    try {
      const response = await fetch("/api/admin/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          state,
          areaType,
          capacity: Math.max(0, Number(capacity) || 0),
          isActive: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Failed to add city.");
      setName("");
      setState("");
      setCapacity(0);
      await load();
      dismissToast(loadingId);
      toastSuccess("City added.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Failed to add city.");
    }
  }

  async function saveCapacity(city: CityWithCapacity) {
    const next = Math.max(0, Number(editCapacity[city.id] ?? city.capacity) || 0);
    const loadingId = toastLoading("Updating capacity…");
    try {
      const response = await fetch(`/api/admin/cities/${city.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacity: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Failed to update capacity.");
      await load();
      dismissToast(loadingId);
      toastSuccess("Capacity updated.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Failed to update capacity.");
    }
  }

  async function setActive(city: CityWithCapacity, isActive: boolean) {
    const loadingId = toastLoading(isActive ? "Activating…" : "Deactivating…");
    try {
      const response = await fetch(`/api/admin/cities/${city.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Failed to update city.");
      await load();
      dismissToast(loadingId);
      toastSuccess(isActive ? "City activated." : "City deactivated. Existing responses were kept.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Failed to update city.");
    }
  }

  async function removeCity(city: CityWithCapacity) {
    const loadingId = toastLoading("Deleting city…");
    try {
      const response = await fetch(`/api/admin/cities/${city.id}`, {
        method: "DELETE",
      });
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

  return (
    <section className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">Cities &amp; capacity</h3>
      <p className="mt-2 text-sm leading-relaxed text-plum-muted">
        Operational quota tags (<span className="font-mono">urban</span> /{" "}
        <span className="font-mono">local</span>) are set here. They are not Q15
        self-reported area type. Achieved counts only qualified completions.
      </p>

      <p className="mt-4 rounded-[10px] border border-border bg-accent-soft px-3 py-2 text-sm text-text-primary">
        Unallocated:{" "}
        <span className="font-mono font-semibold tabular-nums">{unallocated}</span>
        {" · "}
        active city sum{" "}
        <span className="font-mono tabular-nums">
          {payload?.activeCityCapacitySum ?? 0}
        </span>
        {" / "}
        total capacity{" "}
        <span className="font-mono tabular-nums">{totalCapacity}</span>
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="City"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          placeholder="State / UT"
          value={state}
          onChange={(event) => setState(event.target.value)}
        />
        <Select
          value={areaType}
          onChange={(event) => setAreaType(event.target.value as CityAreaType)}
        >
          <option value="urban">Urban</option>
          <option value="local">Local</option>
        </Select>
        <Input
          type="number"
          min={0}
          placeholder="Capacity"
          value={capacity}
          onChange={(event) => setCapacity(Number(event.target.value) || 0)}
        />
        <Button type="button" onClick={() => void addCity()} disabled={!name.trim() || !state.trim()}>
          Add city
        </Button>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              <th className="py-2 pr-3">City</th>
              <th className="py-2 pr-3">State</th>
              <th className="py-2 pr-3">Area type</th>
              <th className="py-2 pr-3">Capacity</th>
              <th className="py-2 pr-3">Achieved</th>
              <th className="py-2 pr-3">Remaining</th>
              <th className="py-2 pr-3">% full</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="py-6 text-text-muted">
                  Loading cities…
                </td>
              </tr>
            ) : (payload?.cities.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-text-muted">
                  No cities yet. Add one above.
                </td>
              </tr>
            ) : (
              payload?.cities.map((city) => (
                <tr key={city.id} className="border-b border-border/70">
                  <td className="py-3 pr-3 font-medium text-text-primary">{city.name}</td>
                  <td className="py-3 pr-3 text-text-body">{city.state}</td>
                  <td className="py-3 pr-3 capitalize text-text-body">{city.areaType}</td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        className="h-9 w-20"
                        value={editCapacity[city.id] ?? String(city.capacity)}
                        onChange={(event) =>
                          setEditCapacity((current) => ({
                            ...current,
                            [city.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          editCapacity[city.id] !== undefined &&
                          Number(editCapacity[city.id]) !== city.capacity
                            ? "default"
                            : "outline"
                        }
                        onClick={() => void saveCapacity(city)}
                      >
                        Save
                      </Button>
                    </div>
                    {editCapacity[city.id] !== undefined &&
                    Number(editCapacity[city.id]) !== city.capacity ? (
                      <p className="mt-1 text-[11px] text-destructive">
                        Unsaved — remaining still uses {city.capacity}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 font-mono tabular-nums">{city.achieved}</td>
                  <td className="py-3 pr-3 font-mono tabular-nums">{city.remaining}</td>
                  <td className="py-3 pr-3 font-mono tabular-nums">{city.pctFull}%</td>
                  <td className="py-3 pr-3">
                    {city.isActive ? (
                      <span className="text-primary">Active</span>
                    ) : (
                      <span className="text-text-muted">Inactive</span>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void setActive(city, !city.isActive)}
                      >
                        {city.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void removeCity(city)}
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
    </section>
  );
}
