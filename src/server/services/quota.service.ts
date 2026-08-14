import type { AreaType } from "@/lib/india-states";
import {
  parseAreaType,
  quotaCellId,
  resolveIndiaState,
  titleCaseCityName,
} from "@/lib/india-states";
import {
  divideCityTargets,
  divideStates,
  maxStatesForCellSize,
  splitStateByArea,
} from "@/lib/quota/allocate";
import type {
  QuotaCellRow,
  QuotaCityRow,
  QuotaSnapshot,
  QuotaStateRow,
} from "@/lib/quota/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  countQualifiedCompletions,
  listCities,
  listCitiesWithCapacity,
  type CityRecord,
} from "@/server/repositories/cities.repository";
import { isCapacityEnforced } from "@/lib/study-config/gates";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";

type StateAllocRow = {
  state: string;
  allocation: number;
  urban_pct: number;
  allocation_manual: boolean;
  urban_pct_manual: boolean;
};

type CellDeltaRow = {
  state: string;
  area_type: string;
  delta: number;
};

async function countQualified(filter: {
  cityId?: string | null;
  state?: string | null;
  areaType?: AreaType | null;
}): Promise<number> {
  return countQualifiedCompletions({
    cityId: filter.cityId,
    state: filter.state,
    areaType: filter.areaType,
  });
}

async function listStateAllocRows(): Promise<StateAllocRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("study_state_allocations")
    .select("*")
    .order("state", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StateAllocRow[];
}

async function listCellDeltas(): Promise<CellDeltaRow[]> {
  const { data, error } = await getSupabaseAdmin().from("quota_cell_deltas").select("*");
  if (error) throw error;
  return (data ?? []) as CellDeltaRow[];
}

export async function buildQuotaSnapshot(): Promise<QuotaSnapshot> {
  const [config, cities, allocRows, deltas, reallocations] = await PromiseAllSafe();
  const activeStates = [
    ...new Set(cities.filter((c) => c.isActive).map((c) => c.state)),
  ].sort((a, b) => a.localeCompare(b, "en"));

  const manualAlloc: Record<string, number> = {};
  const allocByState = new Map(allocRows.map((row) => [row.state, row]));
  for (const row of allocRows) {
    if (row.allocation_manual) manualAlloc[row.state] = row.allocation;
  }
  const computed = divideStates(config.total_capacity, activeStates, manualAlloc);

  const deltaMap = new Map(
    deltas.map((d) => [`${d.state}|${parseAreaType(d.area_type)}`, d.delta] as const),
  );

  const [globalAchieved, achievedUrban, achievedRural, cityStats] =
    await Promise.all([
      countQualified({}),
      countQualified({ areaType: "urban" }),
      countQualified({ areaType: "rural" }),
      loadCityQuotaStats(cities.map((c) => c.id)),
    ]);
  const { cityAchieved, lastCompletionByCity, hasResponses } = cityStats;

  const stateRows: QuotaStateRow[] = [];
  for (const state of activeStates) {
    const stored = allocByState.get(state);
    const allocation = stored?.allocation_manual
      ? stored.allocation
      : (computed.get(state) ?? stored?.allocation ?? 0);
    const urbanPct = stored?.urban_pct_manual
      ? stored.urban_pct
      : config.urban_non_urban_pct;
    const split = splitStateByArea(allocation, urbanPct);
    const urbanDelta = deltaMap.get(quotaCellId(state, "urban")) ?? 0;
    const ruralDelta = deltaMap.get(quotaCellId(state, "rural")) ?? 0;
    const urbanAlloc = Math.max(0, split.urban + urbanDelta);
    const ruralAlloc = Math.max(0, split.rural + ruralDelta);

    const inState = cities.filter((c) => c.state === state);
    const urbanCities = inState.filter((c) => c.areaType === "urban");
    const ruralCities = inState.filter((c) => c.areaType === "rural");

    const urbanCell = buildCell({
      state,
      areaType: "urban",
      allocation: urbanAlloc,
      delta: urbanDelta,
      cities: urbanCities,
      cityAchieved,
      lastCompletionByCity,
      hasResponses,
    });
    const ruralCell = buildCell({
      state,
      areaType: "rural",
      allocation: ruralAlloc,
      delta: ruralDelta,
      cities: ruralCities,
      cityAchieved,
      lastCompletionByCity,
      hasResponses,
    });

    const achieved = urbanCell.achieved + ruralCell.achieved;
    stateRows.push({
      state,
      allocation,
      allocationManual: stored?.allocation_manual ?? false,
      urbanPct,
      urbanPctManual: stored?.urban_pct_manual ?? false,
      achieved,
      remaining: Math.max(0, allocation - achieved),
      pctFull: pct(achieved, allocation),
      urban: urbanCell,
      rural: ruralCell,
    });
  }

  const stateAllocationSum = stateRows.reduce((sum, row) => sum + row.allocation, 0);
  const totalClosesAt = cities
    .filter((c) => c.isActive)
    .reduce((sum, c) => sum + c.capacity, 0);

  const maxStates = maxStatesForCellSize(config.total_capacity);
  let cellWarning: string | null = null;
  if (activeStates.length > maxStates) {
    cellWarning = `At N=${config.total_capacity} with a 50:50 urban/rural split, more than ${maxStates} states pushes every cell below 30. Add states only with a written note, or raise total capacity.`;
  } else {
    const small = stateRows.flatMap((row) =>
      [row.urban, row.rural].filter((cell) => cell.allocation > 0 && cell.allocation < 30),
    );
    if (small.length > 0) {
      cellWarning = `Cell size warning: ${small
        .map((c) => `${c.state} ${c.areaType}=${c.allocation}`)
        .join(", ")} is under 30.`;
    }
  }

  const unweightedUrbanPct =
    globalAchieved > 0 ? Math.round((achievedUrban / globalAchieved) * 1000) / 10 : null;
  const skewPoints =
    unweightedUrbanPct == null ? null : Math.round((unweightedUrbanPct - 50) * 10) / 10;

  return {
    totalCapacity: config.total_capacity,
    urbanPct: config.urban_non_urban_pct,
    reallocation: {
      minFillPct: config.quota_reallocation_min_fill_pct,
      afterDays: config.quota_reallocation_after_days,
      maxTransferPctOfRemaining: config.quota_reallocation_max_transfer_pct,
    },
    achievedGlobal: globalAchieved,
    achievedUrban,
    achievedRural,
    unweightedUrbanPct,
    skewPoints,
    stateAllocationSum,
    unallocated: config.total_capacity - stateAllocationSum,
    totalClosesAt,
    cellWarning,
    states: stateRows,
    reallocations,
  };
}

async function PromiseAllSafe() {
  const config = await getStudyConfig();
  const cities = await listCities();
  const allocRows = await listStateAllocRows();
  const deltas = await listCellDeltas();
  const reallocations = await listReallocationAudit();
  return [config, cities, allocRows, deltas, reallocations] as const;
}

function buildCell(input: {
  state: string;
  areaType: AreaType;
  allocation: number;
  delta: number;
  cities: CityRecord[];
  cityAchieved: Map<string, number>;
  lastCompletionByCity: Map<string, number | null>;
  hasResponses: Map<string, boolean>;
}): QuotaCellRow {
  const cityRows: QuotaCityRow[] = input.cities
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .map((city) => {
      const achieved = input.cityAchieved.get(city.id) ?? 0;
      const target = Math.max(0, city.capacity - city.buffer);
      return {
        id: city.id,
        name: city.name,
        state: city.state,
        areaType: city.areaType,
        target,
        buffer: city.buffer,
        closesAt: city.capacity,
        achieved,
        remaining: Math.max(0, city.capacity - achieved),
        pctFull: pct(achieved, city.capacity),
        isOpen: city.isOpen,
        isActive: city.isActive,
        hasResponses: input.hasResponses.get(city.id) ?? false,
        daysSinceLastCompletion: input.lastCompletionByCity.get(city.id) ?? null,
      };
    });

  const achieved = cityRows.reduce((sum, city) => sum + city.achieved, 0);
  const closesAtSum = cityRows
    .filter((c) => c.isActive)
    .reduce((sum, city) => sum + city.closesAt, 0);
  const days = cityRows
    .map((c) => c.daysSinceLastCompletion)
    .filter((d): d is number => d != null);
  return {
    state: input.state,
    areaType: input.areaType,
    cellId: quotaCellId(input.state, input.areaType),
    allocation: input.allocation,
    delta: input.delta,
    achieved,
    remaining: Math.max(0, input.allocation - achieved),
    pctFull: pct(achieved, input.allocation),
    closesAtSum,
    daysSinceLastCompletion: days.length ? Math.min(...days) : null,
    cities: cityRows,
  };
}

function pct(achieved: number, cap: number): number {
  if (cap <= 0) return achieved > 0 ? 100 : 0;
  return Math.round((achieved / cap) * 1000) / 10;
}

type ScreenerCityRow = {
  city_id: string | null;
  submitted_at?: string;
};

const PAGE_SIZE = 1000;

async function paginateScreenerRows(
  build: (from: number, to: number) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>,
): Promise<ScreenerCityRow[]> {
  const out: ScreenerCityRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as ScreenerCityRow[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

/** One paginated scan instead of N RPCs + a giant `.in()` (PostgREST 400 / timeouts). */
async function loadCityQuotaStats(cityIds: string[]): Promise<{
  cityAchieved: Map<string, number>;
  lastCompletionByCity: Map<string, number | null>;
  hasResponses: Map<string, boolean>;
}> {
  const cityAchieved = new Map<string, number>();
  const lastIso = new Map<string, string>();
  const hasResponses = new Map<string, boolean>();
  for (const id of cityIds) {
    cityAchieved.set(id, 0);
    hasResponses.set(id, false);
  }
  if (cityIds.length === 0) {
    return {
      cityAchieved,
      lastCompletionByCity: new Map(),
      hasResponses,
    };
  }

  const admin = getSupabaseAdmin();
  const completes = await paginateScreenerRows((from, to) =>
    admin
      .from("screener_responses")
      .select("city_id, submitted_at")
      .eq("completion_status", "Completed")
      .is("deleted_at", null)
      .not("city_id", "is", null)
      .order("submitted_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  for (const row of completes) {
    if (!row.city_id) continue;
    cityAchieved.set(row.city_id, (cityAchieved.get(row.city_id) ?? 0) + 1);
    if (row.submitted_at) lastIso.set(row.city_id, row.submitted_at);
    hasResponses.set(row.city_id, true);
  }

  try {
    const otherResponses = await paginateScreenerRows((from, to) =>
      admin
        .from("screener_responses")
        .select("city_id")
        .not("city_id", "is", null)
        .is("deleted_at", null)
        .neq("completion_status", "Completed")
        .order("id", { ascending: true })
        .range(from, to),
    );
    for (const row of otherResponses) {
      if (row.city_id) hasResponses.set(row.city_id, true);
    }
  } catch (error) {
    console.warn("City has-responses scan skipped:", error);
  }

  const now = Date.now();
  const lastCompletionByCity = new Map<string, number | null>();
  for (const id of cityIds) {
    const iso = lastIso.get(id);
    lastCompletionByCity.set(
      id,
      iso ? Math.floor((now - new Date(iso).getTime()) / 86_400_000) : null,
    );
  }
  return { cityAchieved, lastCompletionByCity, hasResponses };
}

async function listReallocationAudit(): Promise<QuotaSnapshot["reallocations"]> {
  const { data, error } = await getSupabaseAdmin()
    .from("quota_reallocations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string;
    created_at: string;
    actor_email: string | null;
    from_state: string;
    from_area_type: string;
    to_state: string;
    to_area_type: string;
    amount: number;
    reason: string | null;
    from_days_since_last_completion: number | null;
  }>).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    actorEmail: row.actor_email,
    fromState: row.from_state,
    fromAreaType: parseAreaType(row.from_area_type),
    toState: row.to_state,
    toAreaType: parseAreaType(row.to_area_type),
    amount: row.amount,
    reason: row.reason,
    fromDaysSinceLastCompletion: row.from_days_since_last_completion,
  }));
}

/** Dropdown: active cities. Cities at or over cities.capacity are hidden when enforce_capacity is on. */
export async function listSelectableCities(): Promise<
  Array<{ id: string; name: string; state: string }>
> {
  const config = await getStudyConfig();
  const enforce = isCapacityEnforced(config);

  let snapshot: QuotaSnapshot;
  try {
    snapshot = await buildQuotaSnapshot();
  } catch {
    const cities = await listCitiesWithCapacity();
    return cities
      .filter((city) => city.isActive && (enforce ? city.remaining > 0 : true))
      .map(({ id, name, state }) => ({ id, name, state }))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
  }
  const out: Array<{ id: string; name: string; state: string }> = [];
  for (const state of snapshot.states) {
    for (const cell of [state.urban, state.rural]) {
      for (const city of cell.cities) {
        if (!city.isActive) continue;
        if (enforce && (city.remaining <= 0 || !city.isOpen)) continue;
        out.push({ id: city.id, name: city.name, state: city.state });
      }
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return out;
}

export function normalizeCityInput(input: {
  name: string;
  state: string;
  areaType: string;
}): { name: string; state: string; areaType: AreaType } {
  const state = resolveIndiaState(input.state);
  if (!state) {
    throw new Error("STATE_NOT_IN_Q15_LIST");
  }
  return {
    name: titleCaseCityName(input.name),
    state,
    areaType: parseAreaType(input.areaType),
  };
}

export async function ensureStateAllocation(state: string, actorId?: string | null) {
  const [config, cities, rows] = await Promise.all([
    getStudyConfig(),
    listCities(),
    listStateAllocRows(),
  ]);
  if (rows.some((row) => row.state === state)) return;

  const activeStates = [
    ...new Set(
      [...cities.filter((c) => c.isActive).map((c) => c.state), state].filter(Boolean),
    ),
  ];
  const manual: Record<string, number> = {};
  for (const row of rows) {
    if (row.allocation_manual) manual[row.state] = row.allocation;
  }
  const split = divideStates(config.total_capacity, activeStates, manual);
  const allocation = split.get(state) ?? 0;

  const { error } = await getSupabaseAdmin().from("study_state_allocations").insert({
    state,
    allocation,
    urban_pct: config.urban_non_urban_pct,
    allocation_manual: false,
    urban_pct_manual: false,
    updated_by: actorId ?? null,
  });
  if (error) throw error;
}

export async function saveStateAllocations(input: {
  states: Array<{
    state: string;
    allocation: number;
    allocationManual: boolean;
    urbanPct: number;
    urbanPctManual: boolean;
  }>;
  actorId?: string | null;
}): Promise<void> {
  const config = await getStudyConfig();
  const sum = input.states.reduce((total, row) => total + row.allocation, 0);
  if (sum > config.total_capacity) {
    throw new Error(
      `STATE_ALLOC_EXCEEDS_TOTAL: ${sum} > ${config.total_capacity}`,
    );
  }
  for (const row of input.states) {
    if (!resolveIndiaState(row.state)) {
      throw new Error("STATE_NOT_IN_Q15_LIST");
    }
    if (row.urbanPct < 0 || row.urbanPct > 100) {
      throw new Error("INVALID_URBAN_PCT");
    }
  }

  const admin = getSupabaseAdmin();
  for (const row of input.states) {
    const { error } = await admin.from("study_state_allocations").upsert(
      {
        state: row.state,
        allocation: row.allocation,
        allocation_manual: row.allocationManual,
        urban_pct: row.urbanPct,
        urban_pct_manual: row.urbanPctManual,
        updated_at: new Date().toISOString(),
        updated_by: input.actorId ?? null,
      },
      { onConflict: "state" },
    );
    if (error) throw error;
  }
}

export async function recalculateCellTargets(input: {
  state: string;
  areaType: AreaType;
  actorId?: string | null;
}): Promise<void> {
  const snapshot = await buildQuotaSnapshot();
  const stateRow = snapshot.states.find((row) => row.state === input.state);
  if (!stateRow) throw new Error("STATE_NOT_FOUND");
  const cell = input.areaType === "urban" ? stateRow.urban : stateRow.rural;
  const activeCities = cell.cities.filter((c) => c.isActive);
  const targets = divideCityTargets({
    cellAlloc: cell.allocation,
    cities: activeCities.map((c) => ({ name: c.name, buffer: c.buffer })),
  });

  const admin = getSupabaseAdmin();
  for (const city of activeCities) {
    const next = targets.get(city.name);
    if (!next) continue;
    const { error } = await admin
      .from("cities")
      .update({
        capacity: next.closesAt,
        updated_by: input.actorId ?? null,
      })
      .eq("id", city.id);
    if (error) throw error;
  }
}

export async function reallocateCell(input: {
  fromState: string;
  fromAreaType: AreaType;
  toState: string;
  toAreaType: AreaType;
  amount: number;
  reason?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
}): Promise<void> {
  if (input.amount <= 0) throw new Error("INVALID_AMOUNT");
  if (
    input.fromState === input.toState &&
    input.fromAreaType === input.toAreaType
  ) {
    throw new Error("SAME_CELL");
  }

  const snapshot = await buildQuotaSnapshot();
  const fromState = snapshot.states.find((s) => s.state === input.fromState);
  const toState = snapshot.states.find((s) => s.state === input.toState);
  if (!fromState || !toState) throw new Error("STATE_NOT_FOUND");

  const fromCell = input.fromAreaType === "urban" ? fromState.urban : fromState.rural;
  const toCell = input.toAreaType === "urban" ? toState.urban : toState.rural;

  const fillPct = fromCell.allocation <= 0 ? 0 : (fromCell.achieved / fromCell.allocation) * 100;
  if (fillPct > snapshot.reallocation.minFillPct) {
    throw new Error(
      `REALLOC_FILL_TOO_HIGH: donor cell is ${fillPct.toFixed(1)}% full (threshold ${snapshot.reallocation.minFillPct}%).`,
    );
  }
  const days = fromCell.daysSinceLastCompletion;
  if (days != null && days < snapshot.reallocation.afterDays) {
    throw new Error(
      `REALLOC_TOO_SOON: last completion was ${days} day(s) ago (need ${snapshot.reallocation.afterDays}).`,
    );
  }
  const maxTransfer = Math.floor(
    (fromCell.remaining * snapshot.reallocation.maxTransferPctOfRemaining) / 100,
  );
  if (input.amount > maxTransfer) {
    throw new Error(
      `REALLOC_AMOUNT_TOO_HIGH: max transferable is ${maxTransfer} (${snapshot.reallocation.maxTransferPctOfRemaining}% of remaining ${fromCell.remaining}).`,
    );
  }
  if (input.amount > fromCell.remaining) {
    throw new Error("REALLOC_EXCEEDS_REMAINING");
  }

  const admin = getSupabaseAdmin();
  const nextFrom = fromCell.delta - input.amount;
  const nextTo = toCell.delta + input.amount;

  const { error: fromErr } = await admin.from("quota_cell_deltas").upsert(
    { state: input.fromState, area_type: input.fromAreaType, delta: nextFrom },
    { onConflict: "state,area_type" },
  );
  if (fromErr) throw fromErr;
  const { error: toErr } = await admin.from("quota_cell_deltas").upsert(
    { state: input.toState, area_type: input.toAreaType, delta: nextTo },
    { onConflict: "state,area_type" },
  );
  if (toErr) throw toErr;

  const { error: auditErr } = await admin.from("quota_reallocations").insert({
    actor_id: input.actorId ?? null,
    actor_email: input.actorEmail ?? null,
    from_state: input.fromState,
    from_area_type: input.fromAreaType,
    to_state: input.toState,
    to_area_type: input.toAreaType,
    amount: input.amount,
    reason: input.reason ?? null,
    from_achieved: fromCell.achieved,
    from_allocation_before: fromCell.allocation,
    from_days_since_last_completion: days,
  });
  if (auditErr) throw auditErr;

  const { error: logErr } = await admin.from("config_audit_log").insert({
    actor_id: input.actorId ?? null,
    actor_email: input.actorEmail ?? null,
    entity_type: "quota_reallocation",
    entity_id: null,
    field: "cell.reallocate",
    old_value: `${fromCell.cellId}:${fromCell.allocation}`,
    new_value: `${toCell.cellId}:+${input.amount}`,
  });
  if (logErr) throw logErr;
}

export function validateCityClosesAt(
  snapshot: QuotaSnapshot,
  state: string,
  areaType: AreaType,
  cityId: string | null,
  nextClosesAt: number,
): void {
  const stateRow = snapshot.states.find((row) => row.state === state);
  if (!stateRow) return;
  const cell = areaType === "urban" ? stateRow.urban : stateRow.rural;
  const sum = cell.cities.reduce((total, city) => {
    if (!city.isActive) return total;
    if (cityId && city.id === cityId) return total + nextClosesAt;
    return total + city.closesAt;
  }, cityId ? 0 : nextClosesAt);
  if (sum > cell.allocation) {
    throw new Error(
      `CITY_CLOSES_AT_EXCEEDS_CELL: ${state}|${areaType} closes-at ${sum} > cell ${cell.allocation}`,
    );
  }
}
