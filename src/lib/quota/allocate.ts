import type { AreaType } from "@/lib/india-states";

/**
 * Equal integer split. Remainder goes to the first names alphabetically
 * so the result is reproducible (A before B before C).
 */
export function divideEqually(total: number, names: string[]): Map<string, number> {
  const sorted = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
  const out = new Map<string, number>();
  if (sorted.length === 0 || total <= 0) {
    for (const name of sorted) out.set(name, 0);
    return out;
  }
  const base = Math.floor(total / sorted.length);
  const rem = total % sorted.length;
  sorted.forEach((name, index) => {
    out.set(name, base + (index < rem ? 1 : 0));
  });
  return out;
}

/**
 * Split a state allocation by urban %.
 * When urbanPct === 50 and allocation is odd, the extra unit goes to
 * rural (harder online cell to fill).
 * urban + rural always equals allocation exactly.
 */
export function splitStateByArea(
  allocation: number,
  urbanPct = 50,
): { urban: number; rural: number } {
  const safeAlloc = Math.max(0, Math.round(allocation));
  const pct = Math.min(100, Math.max(0, Math.round(urbanPct)));
  if (pct === 50) {
    const urban = Math.floor(safeAlloc / 2);
    return { urban, rural: safeAlloc - urban };
  }
  const urban = Math.floor((safeAlloc * pct) / 100);
  return { urban, rural: safeAlloc - urban };
}

/**
 * Default equal split of total_capacity across active states.
 * Remainder (+1) goes to the first states alphabetically.
 * Manual overrides keep their value; leftover capacity splits across
 * non-override states.
 */
export function divideStates(
  totalCapacity: number,
  states: string[],
  manual?: Record<string, number>,
): Map<string, number> {
  const unique = [...new Set(states.map((s) => s.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
  const out = new Map<string, number>();
  if (unique.length === 0) return out;

  const overrides = manual ?? {};
  const locked = unique.filter((s) => overrides[s] != null);
  const flexible = unique.filter((s) => overrides[s] == null);
  let used = 0;
  for (const state of locked) {
    const value = Math.max(0, Math.round(overrides[state]!));
    out.set(state, value);
    used += value;
  }
  const remaining = Math.max(0, totalCapacity - used);
  if (flexible.length === 0) return out;
  const split = divideEqually(remaining, flexible);
  for (const state of flexible) {
    out.set(state, split.get(state) ?? 0);
  }
  return out;
}

export function cellAllocation(input: {
  stateAllocation: number;
  urbanPct: number;
  areaType: AreaType;
  delta?: number;
}): number {
  const split = splitStateByArea(input.stateAllocation, input.urbanPct);
  const base = input.areaType === "urban" ? split.urban : split.rural;
  return Math.max(0, base + (input.delta ?? 0));
}

/**
 * City targets inside a cell.
 * Targets auto-divide (cellAlloc - sum(buffers)) equally; remainder alpha.
 * Closes At = target + buffer. Submit enforcement uses Closes At, not Target.
 */
export function divideCityTargets(input: {
  cellAlloc: number;
  cities: Array<{ name: string; buffer: number }>;
}): Map<string, { target: number; buffer: number; closesAt: number }> {
  const out = new Map<string, { target: number; buffer: number; closesAt: number }>();
  const buffers = input.cities.reduce((sum, city) => sum + Math.max(0, city.buffer), 0);
  const pool = input.cellAlloc - buffers;
  if (pool < 0) {
    for (const city of input.cities) {
      out.set(city.name, { target: 0, buffer: city.buffer, closesAt: city.buffer });
    }
    return out;
  }
  const split = divideEqually(
    pool,
    input.cities.map((c) => c.name),
  );
  for (const city of input.cities) {
    const target = split.get(city.name) ?? 0;
    const buffer = Math.max(0, city.buffer);
    out.set(city.name, { target, buffer, closesAt: target + buffer });
  }
  return out;
}

export function maxStatesForCellSize(totalCapacity: number, minCell = 30): number {
  return Math.floor(totalCapacity / (minCell * 2));
}
