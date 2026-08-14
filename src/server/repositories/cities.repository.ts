import { cityMatchKey } from "@/lib/city-resolve";
import { parseAreaType, type AreaType } from "@/lib/india-states";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";

export type CityAreaType = AreaType;

export type CityRecord = {
  id: string;
  name: string;
  state: string;
  areaType: CityAreaType;
  capacity: number;
  buffer: number;
  isOpen: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type CityWithCapacity = CityRecord & {
  achieved: number;
  remaining: number;
  pctFull: number;
  target: number;
};

type CityRow = {
  id: string;
  name: string;
  state: string;
  area_type: string;
  capacity: number;
  buffer?: number | null;
  is_open?: boolean | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

function mapCity(row: CityRow): CityRecord {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    areaType: parseAreaType(row.area_type),
    capacity: row.capacity,
    buffer: Math.max(0, row.buffer ?? 0),
    isOpen: row.is_open !== false,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export async function countQualifiedCompletions(filter?: {
  cityId?: string | null;
  state?: string | null;
  areaType?: AreaType | null;
}): Promise<number> {
  const admin = getSupabaseAdmin();
  type RpcCount = { data: number | null; error: { message: string } | null };

  const full = (await admin.rpc("count_qualified_completions", {
    p_city_id: filter?.cityId ?? null,
    p_state: filter?.state ?? null,
    p_area_type: filter?.areaType ?? null,
  })) as RpcCount;
  if (!full.error) {
    return typeof full.data === "number" ? full.data : Number(full.data ?? 0);
  }
  if (filter?.state || filter?.areaType) throw full.error;

  const legacy = (await admin.rpc("count_qualified_completions", {
    p_city_id: filter?.cityId ?? null,
  })) as RpcCount;
  if (legacy.error) throw legacy.error;
  return typeof legacy.data === "number" ? legacy.data : Number(legacy.data ?? 0);
}

export async function listCities(): Promise<CityRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("cities")
    .select("*")
    .order("state", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as CityRow[]).map(mapCity);
}

export async function getCityById(id: string): Promise<CityRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("cities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapCity(data as CityRow) : null;
}

/** Matches idx_cities_name_state_unique (lower name + lower state). */
export async function findCityByNameAndState(
  name: string,
  state: string,
): Promise<CityRecord | null> {
  const trimmedName = name.trim();
  const trimmedState = state.trim();
  if (!trimmedName || !trimmedState) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("cities")
    .select("*")
    .ilike("name", trimmedName)
    .ilike("state", trimmedState)
    .maybeSingle();

  if (error) throw error;
  return data ? mapCity(data as CityRow) : null;
}

export async function listCitiesWithCapacity(): Promise<CityWithCapacity[]> {
  const cities = await listCities();
  const withCounts = await Promise.all(
    cities.map(async (city) => {
      const achieved = await countQualifiedCompletions({ cityId: city.id });
      const remaining = city.capacity - achieved;
      const pctFull =
        city.capacity <= 0
          ? achieved > 0
            ? 100
            : 0
          : Math.round((achieved / city.capacity) * 1000) / 10;
      return {
        ...city,
        achieved,
        remaining,
        pctFull,
        target: Math.max(0, city.capacity - city.buffer),
      };
    }),
  );
  return withCounts;
}

export async function sumActiveCityCapacities(
  cities?: CityRecord[],
): Promise<number> {
  const list = cities ?? (await listCities());
  return list
    .filter((city) => city.isActive)
    .reduce((sum, city) => sum + city.capacity, 0);
}

export async function findCityByMatchKeyAndState(
  matchKey: string,
  state: string,
  excludeCityId?: string,
): Promise<CityRecord | null> {
  const key = matchKey.trim();
  const trimmedState = state.trim();
  if (!key || !trimmedState) return null;

  let query = getSupabaseAdmin()
    .from("cities")
    .select("*")
    .eq("match_key", key)
    .ilike("state", trimmedState);
  if (excludeCityId) query = query.neq("id", excludeCityId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data ? mapCity(data as CityRow) : null;
}

export async function findAliasTargetCity(matchKey: string): Promise<{
  alias: string;
  city: CityRecord;
} | null> {
  const key = matchKey.trim();
  if (!key) return null;
  const { data: aliasRow, error } = await getSupabaseAdmin()
    .from("city_aliases")
    .select("alias, city_id")
    .eq("match_key", key)
    .maybeSingle();
  if (error) throw error;
  if (!aliasRow?.city_id) return null;
  const city = await getCityById(aliasRow.city_id);
  if (!city) return null;
  return { alias: aliasRow.alias, city };
}

export async function assertCityMatchKeyAvailable(input: {
  matchKey: string;
  state: string;
  excludeCityId?: string;
}): Promise<void> {
  const aliasHit = await findAliasTargetCity(input.matchKey);
  if (aliasHit && aliasHit.city.id !== input.excludeCityId) {
    throw new Error(
      `CITY_MATCH_KEY_IS_ALIAS: "${input.matchKey}" is already an alias of ${aliasHit.city.name} (${aliasHit.city.state}). Add it as an alias on that city instead of creating a new row.`,
    );
  }
  const existing = await findCityByMatchKeyAndState(
    input.matchKey,
    input.state,
    input.excludeCityId,
  );
  if (existing) {
    throw new Error(
      `CITY_MATCH_KEY_EXISTS: ${existing.name} (${existing.state}) already uses this spelling.`,
    );
  }
}

export async function createCity(input: {
  name: string;
  state: string;
  areaType: CityAreaType;
  capacity?: number;
  buffer?: number;
  isOpen?: boolean;
  isActive?: boolean;
  actorId: string;
}): Promise<CityRecord> {
  const capacity =
    input.capacity ?? (await getStudyConfig()).default_city_capacity;
  const matchKey = cityMatchKey(input.name);
  await assertCityMatchKeyAvailable({
    matchKey,
    state: input.state.trim(),
  });
  const { data, error } = await getSupabaseAdmin()
    .from("cities")
    .insert({
      name: input.name.trim(),
      state: input.state.trim(),
      area_type: input.areaType,
      capacity,
      buffer: input.buffer ?? 0,
      match_key: matchKey,
      is_open: input.isOpen ?? true,
      is_active: input.isActive ?? true,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(describeCityWriteError(error.message));
  }
  return mapCity(data as CityRow);
}

function describeCityWriteError(message: string): string {
  if (/CITY_MATCH_KEY_IS_ALIAS|idx_cities_match_key_state_unique|duplicate key/i.test(message)) {
    return message.replace(/^.*CITY_MATCH_KEY_IS_ALIAS:\s*/i, "CITY_MATCH_KEY_IS_ALIAS: ");
  }
  return message;
}

export async function updateCity(
  id: string,
  input: {
    name?: string;
    state?: string;
    areaType?: CityAreaType;
    capacity?: number;
    buffer?: number;
    isOpen?: boolean;
    isActive?: boolean;
    actorId: string;
  },
): Promise<CityRecord> {
  const patch: {
    updated_by: string;
    name?: string;
    state?: string;
    area_type?: CityAreaType;
    capacity?: number;
    buffer?: number;
    is_open?: boolean;
    is_active?: boolean;
  } = { updated_by: input.actorId };
  if (input.name !== undefined) {
    patch.name = input.name.trim();
    (patch as { match_key?: string }).match_key = cityMatchKey(input.name);
  }
  if (input.state !== undefined) patch.state = input.state.trim();
  const nextName = input.name !== undefined ? input.name.trim() : undefined;
  const nextState = input.state !== undefined ? input.state.trim() : undefined;
  if (nextName !== undefined || nextState !== undefined) {
    const current = await getCityById(id);
    await assertCityMatchKeyAvailable({
      matchKey: cityMatchKey(nextName ?? current?.name ?? ""),
      state: nextState ?? current?.state ?? "",
      excludeCityId: id,
    });
  }
  if (input.areaType !== undefined) patch.area_type = input.areaType;
  if (input.capacity !== undefined) patch.capacity = input.capacity;
  if (input.buffer !== undefined) patch.buffer = input.buffer;
  if (input.isOpen !== undefined) patch.is_open = input.isOpen;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await getSupabaseAdmin()
    .from("cities")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(describeCityWriteError(error.message));
  }
  return mapCity(data as CityRow);
}

export async function countResponsesForCity(cityId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("screener_responses")
    .select("*", { count: "exact", head: true })
    .eq("city_id", cityId);

  if (error) throw error;
  return count ?? 0;
}

export async function deleteCity(id: string): Promise<void> {
  const refs = await countResponsesForCity(id);
  if (refs > 0) {
    throw new Error("CITY_HAS_RESPONSES");
  }

  const { error } = await getSupabaseAdmin().from("cities").delete().eq("id", id);
  if (error) throw error;
}
