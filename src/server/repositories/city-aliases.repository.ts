import { cityMatchKey, normalizeCityDisplayName } from "@/lib/city-resolve";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function createCityAlias(input: {
  cityId: string;
  alias: string;
  matchKey: string;
  actorId?: string | null;
}) {
  const key = input.matchKey.trim() || cityMatchKey(input.alias);
  if (!key) throw new Error("Alias match key is empty.");

  const { data, error } = await getSupabaseAdmin()
    .from("city_aliases")
    .upsert(
      {
        city_id: input.cityId,
        alias: normalizeCityDisplayName(input.alias),
        match_key: key,
        created_by: input.actorId ?? null,
      },
      { onConflict: "match_key" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
