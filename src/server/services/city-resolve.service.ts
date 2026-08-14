import {
  CITY_FULL_INLINE_MESSAGE,
  cityMatchKey,
  type CityMatchType,
  type ResolvedCity,
} from "@/lib/city-resolve";
import { parseAreaType } from "@/lib/india-states";
import { isCapacityEnforced } from "@/lib/study-config/gates";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  countQualifiedCompletions,
  getCityById,
} from "@/server/repositories/cities.repository";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";
import { buildQuotaSnapshot } from "@/server/services/quota.service";
import {
  countActiveUnmatchedCompletes,
  listUnmatchedCityRows,
} from "@/server/services/unmatched-city-resolve.service";

export type { UnmatchedCityRow } from "@/lib/unmatched-city-types";

/** @deprecated Use listUnmatchedCityRows */
export async function listUnmatchedCityCounts(limit = 50) {
  const rows = await listUnmatchedCityRows(limit);
  return rows.map((row) => ({
    raw: row.raw,
    count: row.count,
    latestAt: row.latestAt,
  }));
}

/** @deprecated Use countActiveUnmatchedCompletes */
export async function countUnmatchedCompletions() {
  return countActiveUnmatchedCompletes();
}

type CityRow = {
  id: string;
  name: string;
  state: string;
  area_type: string;
  capacity: number;
  is_active: boolean;
  is_open: boolean | null;
  match_key: string;
};

async function isCityFull(cityId: string): Promise<boolean> {
  const config = await getStudyConfig();
  if (!isCapacityEnforced(config)) return false;

  try {
    const snapshot = await buildQuotaSnapshot();
    if (snapshot.achievedGlobal >= snapshot.totalCapacity) return true;
    for (const state of snapshot.states) {
      if (state.remaining <= 0) {
        for (const cell of [state.urban, state.rural]) {
          if (cell.cities.some((c) => c.id === cityId)) return true;
        }
      }
      for (const cell of [state.urban, state.rural]) {
        if (cell.remaining <= 0 && cell.cities.some((c) => c.id === cityId)) {
          return true;
        }
        const city = cell.cities.find((c) => c.id === cityId);
        if (city && (city.remaining <= 0 || !city.isOpen || !city.isActive)) {
          return true;
        }
      }
    }
  } catch {
    const achieved = await countQualifiedCompletions({ cityId });
    const city = await getCityById(cityId);
    if (!city) return true;
    return achieved >= city.capacity || !city.isOpen || !city.isActive;
  }
  return false;
}

function mapResolved(
  raw: string,
  matchKey: string,
  matchType: CityMatchType,
  city: CityRow | null,
  isFull: boolean,
): ResolvedCity {
  if (!city) {
    return {
      raw,
      matchKey,
      matchType: "unmatched",
      cityId: null,
      name: null,
      state: null,
      areaType: null,
      isOpen: true,
      isActive: true,
      isFull: false,
    };
  }
  return {
    raw,
    matchKey,
    matchType,
    cityId: city.id,
    name: city.name,
    state: city.state,
    areaType: parseAreaType(city.area_type),
    isOpen: city.is_open !== false,
    isActive: city.is_active,
    isFull,
  };
}

/**
 * Match order: exact key within state → exact key any state → alias → unmatched.
 */
export async function resolveCityText(input: {
  cityRaw: string;
  stateLabel?: string | null;
}): Promise<ResolvedCity> {
  const raw = input.cityRaw.trim();
  const matchKey = cityMatchKey(raw);
  if (!matchKey) {
    return mapResolved(raw, "", "unmatched", null, false);
  }

  const admin = getSupabaseAdmin();
  const stateLabel = input.stateLabel?.trim() || null;

  const query = admin
    .from("cities")
    .select("id, name, state, area_type, capacity, is_active, is_open, match_key")
    .eq("match_key", matchKey)
    .eq("is_active", true);

  if (stateLabel) {
    const inState = await query.ilike("state", stateLabel).maybeSingle();
    if (!inState.error && inState.data) {
      const city = inState.data as CityRow;
      const full = await isCityFull(city.id);
      return mapResolved(raw, matchKey, "exact", city, full || !city.is_open);
    }
  }

  const anyState = await admin
    .from("cities")
    .select("id, name, state, area_type, capacity, is_active, is_open, match_key")
    .eq("match_key", matchKey)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!anyState.error && anyState.data) {
    const city = anyState.data as CityRow;
    const full = await isCityFull(city.id);
    return mapResolved(raw, matchKey, "exact", city, full || !city.is_open);
  }

  const { data: aliasRow } = await admin
    .from("city_aliases")
    .select("city_id")
    .eq("match_key", matchKey)
    .maybeSingle();

  if (aliasRow?.city_id) {
    const { data: city } = await admin
      .from("cities")
      .select("id, name, state, area_type, capacity, is_active, is_open, match_key")
      .eq("id", aliasRow.city_id)
      .maybeSingle();
    if (city) {
      const row = city as CityRow;
      const full = await isCityFull(row.id);
      return mapResolved(raw, matchKey, "alias", row, full || !row.is_open);
    }
  }

  return mapResolved(raw, matchKey, "unmatched", null, false);
}

export async function checkCityAvailability(input: {
  cityRaw: string;
  stateLabel?: string | null;
}): Promise<{
  ok: boolean;
  code?: "city_full" | "city_required" | "study_full";
  message?: string;
  resolved: ResolvedCity;
}> {
  const raw = input.cityRaw.trim();
  if (!raw) {
    return {
      ok: false,
      code: "city_required",
      message: "Please enter your city.",
      resolved: mapResolved("", "", "unmatched", null, false),
    };
  }

  const config = await getStudyConfig();
  const resolved = await resolveCityText(input);
  if (!isCapacityEnforced(config)) {
    return { ok: true, resolved };
  }

  if (resolved.matchType !== "unmatched" && resolved.cityId) {
    if (resolved.isFull || !resolved.isOpen || !resolved.isActive) {
      const label = resolved.name ?? raw;
      return {
        ok: false,
        code: "city_full",
        message: CITY_FULL_INLINE_MESSAGE(label),
        resolved,
      };
    }
  }

  try {
    const snapshot = await buildQuotaSnapshot();
    if (snapshot.achievedGlobal >= snapshot.totalCapacity) {
      return {
        ok: false,
        code: "study_full",
        message:
          "This survey has reached its respondent capacity and is no longer accepting new completions.",
        resolved,
      };
    }
  } catch {
    /* ignore if quota tables pending */
  }

  return { ok: true, resolved };
}
