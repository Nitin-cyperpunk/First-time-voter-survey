import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CityAreaType = "urban" | "local";

export type CityRecord = {
  id: string;
  name: string;
  state: string;
  areaType: CityAreaType;
  capacity: number;
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
};

type CityRow = {
  id: string;
  name: string;
  state: string;
  area_type: string;
  capacity: number;
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
    areaType: row.area_type === "local" ? "local" : "urban",
    capacity: row.capacity,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export async function countQualifiedCompletions(
  cityId?: string | null,
): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "count_qualified_completions",
    { p_city_id: cityId ?? null },
  );

  if (error) throw error;
  return typeof data === "number" ? data : Number(data ?? 0);
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

export async function listCitiesWithCapacity(): Promise<CityWithCapacity[]> {
  const cities = await listCities();
  const withCounts = await Promise.all(
    cities.map(async (city) => {
      const achieved = await countQualifiedCompletions(city.id);
      const remaining = Math.max(0, city.capacity - achieved);
      const pctFull =
        city.capacity <= 0
          ? achieved > 0
            ? 100
            : 0
          : Math.min(100, Math.round((achieved / city.capacity) * 1000) / 10);
      return { ...city, achieved, remaining, pctFull };
    }),
  );
  return withCounts;
}

/** Active cities that still have remaining qualified slots. */
export async function listSelectableCities(): Promise<
  Array<Pick<CityRecord, "id" | "name" | "state" | "areaType">>
> {
  const cities = await listCitiesWithCapacity();
  return cities
    .filter((city) => city.isActive && city.remaining > 0)
    .map(({ id, name, state, areaType }) => ({ id, name, state, areaType }));
}

export async function sumActiveCityCapacities(
  cities?: CityRecord[],
): Promise<number> {
  const list = cities ?? (await listCities());
  return list
    .filter((city) => city.isActive)
    .reduce((sum, city) => sum + city.capacity, 0);
}

export async function createCity(input: {
  name: string;
  state: string;
  areaType: CityAreaType;
  capacity: number;
  isActive?: boolean;
  actorId: string;
}): Promise<CityRecord> {
  const { data, error } = await getSupabaseAdmin()
    .from("cities")
    .insert({
      name: input.name.trim(),
      state: input.state.trim(),
      area_type: input.areaType,
      capacity: input.capacity,
      is_active: input.isActive ?? true,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapCity(data as CityRow);
}

export async function updateCity(
  id: string,
  input: {
    name?: string;
    state?: string;
    areaType?: CityAreaType;
    capacity?: number;
    isActive?: boolean;
    actorId: string;
  },
): Promise<CityRecord> {
  const patch: Record<string, unknown> = { updated_by: input.actorId };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.state !== undefined) patch.state = input.state.trim();
  if (input.areaType !== undefined) patch.area_type = input.areaType;
  if (input.capacity !== undefined) patch.capacity = input.capacity;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await getSupabaseAdmin()
    .from("cities")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
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
