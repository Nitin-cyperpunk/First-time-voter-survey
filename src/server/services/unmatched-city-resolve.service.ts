import { cityMatchKey, normalizeCityDisplayName } from "@/lib/city-resolve";
import { rankCitySuggestions } from "@/lib/city-fuzzy-match";
import type {
  IgnoredUnmatchedRow,
  OverQuotaDecision,
  RecountCellPreview,
  RecountCityPreview,
  ResolvePreview,
  ResolvePreviewItem,
  UnmatchedCityRow,
} from "@/lib/unmatched-city-types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logConfigChange } from "@/server/repositories/config-audit.repository";
import { createCityAlias } from "@/server/repositories/city-aliases.repository";
import {
  countQualifiedCompletions,
  createCity,
  findCityByNameAndState,
  getCityById,
  listCities,
  updateCity,
} from "@/server/repositories/cities.repository";
import {
  buildQuotaSnapshot,
  ensureStateAllocation,
  normalizeCityInput,
  validateCityClosesAt,
} from "@/server/services/quota.service";
import type { AreaType } from "@/lib/india-states";

type ScreenerUnmatchedRow = {
  lead_id: string;
  city_raw: string | null;
  submitted_at: string;
};

type ReviewRow = {
  match_key: string;
  status: string;
  restored_at: string | null;
};

async function loadIgnoredKeys(): Promise<Set<string>> {
  const { data, error } = await getSupabaseAdmin()
    .from("city_unmatched_reviews")
    .select("match_key, status, restored_at")
    .eq("status", "ignored")
    .is("restored_at", null);
  if (error) {
    if (/city_unmatched_reviews|PGRST205|schema cache/i.test(error.message)) {
      return new Set();
    }
    throw error;
  }
  return new Set(((data ?? []) as ReviewRow[]).map((row) => row.match_key));
}

async function loadUnmatchedScreenerRows(): Promise<ScreenerUnmatchedRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("screener_responses")
    .select("lead_id, city_raw, submitted_at")
    .eq("city_match_type", "unmatched")
    .eq("completion_status", "Completed")
    .not("city_raw", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(10000);

  if (error) throw error;
  return (data ?? []) as ScreenerUnmatchedRow[];
}

function rowMatchKey(raw: string): string {
  return cityMatchKey(raw) || raw.trim().toLowerCase();
}

function isDuplicateCityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string; details?: string };
  return (
    row.code === "23505" ||
    /duplicate key|idx_cities_name_state_unique/i.test(
      `${row.message ?? ""} ${row.details ?? ""}`,
    )
  );
}

async function loadAliasCatalog(
  cities: Array<{ id: string; name: string; state: string; areaType: AreaType }>,
) {
  const cityById = new Map(cities.map((c) => [c.id, c]));
  const { data, error } = await getSupabaseAdmin()
    .from("city_aliases")
    .select("city_id, alias, match_key");
  if (error) throw error;

  return ((data ?? []) as Array<{ city_id: string; alias: string; match_key: string }>)
    .map((row) => {
      const city = cityById.get(row.city_id);
      if (!city) return null;
      return {
        cityId: row.city_id,
        alias: row.alias,
        matchKey: row.match_key,
        cityName: city.name,
        state: city.state,
        areaType: city.areaType,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

export async function listUnmatchedCityRows(limit = 50): Promise<UnmatchedCityRow[]> {
  const [rows, ignored, cities] = await Promise.all([
    loadUnmatchedScreenerRows(),
    loadIgnoredKeys(),
    listCities(),
  ]);

  const activeCities = cities.filter((c) => c.isActive);
  const aliasRows = await loadAliasCatalog(activeCities);

  const byKey = new Map<
    string,
    { raw: string; count: number; latestAt: string; variants: Set<string> }
  >();

  for (const row of rows) {
    const raw = String(row.city_raw ?? "").trim();
    if (!raw) continue;
    const key = rowMatchKey(raw);
    if (ignored.has(key)) continue;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        raw,
        count: 1,
        latestAt: row.submitted_at,
        variants: new Set([raw]),
      });
    } else {
      existing.count += 1;
      existing.variants.add(raw);
    }
  }

  return [...byKey.entries()]
    .map(([matchKey, group]) => ({
      matchKey,
      raw: group.raw,
      normalized: matchKey,
      count: group.count,
      latestAt: group.latestAt,
      rawVariants: [...group.variants].sort((a, b) => a.localeCompare(b)),
      ignored: false,
      suggestions: rankCitySuggestions(
        matchKey,
        activeCities.map((c) => ({
          id: c.id,
          name: c.name,
          state: c.state,
          areaType: c.areaType,
          matchKey: cityMatchKey(c.name),
        })),
        aliasRows,
      ),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function countActiveUnmatchedCompletes(): Promise<number> {
  const rows = await listUnmatchedCityRows(10_000);
  return rows.reduce((sum, row) => sum + row.count, 0);
}

export async function collectLeadIdsForMatchKeys(
  matchKeys: string[],
): Promise<Map<string, string[]>> {
  const keySet = new Set(matchKeys);
  const rows = await loadUnmatchedScreenerRows();
  const ignored = await loadIgnoredKeys();
  const result = new Map<string, string[]>();

  for (const row of rows) {
    const raw = String(row.city_raw ?? "").trim();
    if (!raw) continue;
    const key = rowMatchKey(raw);
    if (!keySet.has(key) || ignored.has(key)) continue;
    const list = result.get(key) ?? [];
    list.push(row.lead_id);
    result.set(key, list);
  }

  return result;
}

export async function previewUnmatchedResolve(input: {
  resolutions: Array<{
    matchKey: string;
    action: "add_city" | "alias";
    cityId?: string;
    name?: string;
    state?: string;
    areaType?: AreaType;
  }>;
}): Promise<ResolvePreview> {
  const leadMap = await collectLeadIdsForMatchKeys(
    input.resolutions.map((r) => r.matchKey),
  );

  const items: ResolvePreviewItem[] = [];
  const cityIncoming = new Map<string, number>();

  for (const resolution of input.resolutions) {
    const leadIds = leadMap.get(resolution.matchKey) ?? [];
    if (leadIds.length === 0) continue;

    let targetCityId = resolution.cityId ?? "";
    let targetCityName = resolution.name ?? "";
    let matchType: "exact" | "alias" = "alias";

    if (resolution.action === "add_city") {
      if (!resolution.name?.trim() || !resolution.state || !resolution.areaType) {
        throw new Error(`Missing city fields for ${resolution.matchKey}.`);
      }
      const normalized = normalizeCityInput({
        name: resolution.name,
        state: resolution.state,
        areaType: resolution.areaType,
      });
      const existing = await findCityByNameAndState(
        normalized.name,
        normalized.state,
      );
      if (existing) {
        matchType = "exact";
        targetCityId = existing.id;
        targetCityName = existing.name;
      } else {
        matchType = "exact";
        targetCityName = normalized.name;
        targetCityId = `new:${resolution.matchKey}`;
      }
    } else {
      if (!resolution.cityId) {
        throw new Error(`Missing target city for alias on ${resolution.matchKey}.`);
      }
      const city = await getCityById(resolution.cityId);
      if (!city) throw new Error(`City not found for ${resolution.matchKey}.`);
      targetCityId = city.id;
      targetCityName = city.name;
    }

    const sampleRow = (await loadUnmatchedScreenerRows()).find((r) => {
      const raw = String(r.city_raw ?? "").trim();
      return rowMatchKey(raw) === resolution.matchKey;
    });

    items.push({
      matchKey: resolution.matchKey,
      sampleRaw: sampleRow?.city_raw?.trim() ?? resolution.matchKey,
      responseCount: leadIds.length,
      action: resolution.action,
      targetCityId,
      targetCityName,
      matchType,
    });

    cityIncoming.set(
      targetCityId,
      (cityIncoming.get(targetCityId) ?? 0) + leadIds.length,
    );
  }

  const snapshot = await buildQuotaSnapshot();
  const cities: RecountCityPreview[] = [];
  const cellIncoming = new Map<string, number>();

  for (const [cityId, incoming] of cityIncoming) {
    if (cityId.startsWith("new:")) {
      const resolution = input.resolutions.find(
        (r) => `new:${r.matchKey}` === cityId,
      );
      if (!resolution?.state || !resolution.areaType) continue;
      const cellId = `${resolution.state}|${resolution.areaType}`;
      cellIncoming.set(cellId, (cellIncoming.get(cellId) ?? 0) + incoming);
      cities.push({
        cityId,
        cityName: normalizeCityDisplayName(resolution.name ?? ""),
        state: resolution.state,
        areaType: resolution.areaType,
        currentAchieved: 0,
        incoming,
        afterAchieved: incoming,
        closesAt: 0,
        overBy: 0,
      });
      continue;
    }

    const city = await getCityById(cityId);
    if (!city) continue;
    const currentAchieved = await countQualifiedCompletions({ cityId });
    const afterAchieved = currentAchieved + incoming;
    const overBy = Math.max(0, afterAchieved - city.capacity);
    cities.push({
      cityId,
      cityName: city.name,
      state: city.state,
      areaType: city.areaType,
      currentAchieved,
      incoming,
      afterAchieved,
      closesAt: city.capacity,
      overBy,
    });
    const cellId = `${city.state}|${city.areaType}`;
    cellIncoming.set(cellId, (cellIncoming.get(cellId) ?? 0) + incoming);
  }

  const cells: RecountCellPreview[] = [];
  for (const stateRow of snapshot.states) {
    for (const cell of [stateRow.urban, stateRow.rural]) {
      const cellId = `${cell.state}|${cell.areaType}`;
      const incoming = cellIncoming.get(cellId) ?? 0;
      if (incoming === 0) continue;
      const afterAchieved = cell.achieved + incoming;
      const overBy = Math.max(0, afterAchieved - cell.allocation);
      cells.push({
        state: cell.state,
        areaType: cell.areaType,
        cellId,
        currentAchieved: cell.achieved,
        incoming,
        afterAchieved,
        allocation: cell.allocation,
        overBy,
      });
    }
  }

  const hasOverage =
    cities.some((c) => c.overBy > 0) || cells.some((c) => c.overBy > 0);

  return {
    items,
    totalResponses: items.reduce((sum, item) => sum + item.responseCount, 0),
    cells,
    cities,
    hasOverage,
  };
}

export async function commitUnmatchedResolve(input: {
  actorId: string;
  actorEmail: string;
  resolutions: Array<{
    matchKey: string;
    action: "add_city" | "alias";
    cityId?: string;
    name?: string;
    state?: string;
    areaType?: AreaType;
    capacity?: number;
  }>;
  overQuotaDecision?: OverQuotaDecision;
}) {
  const preview = await previewUnmatchedResolve({ resolutions: input.resolutions });

  if (preview.hasOverage) {
    if (!input.overQuotaDecision || input.overQuotaDecision === "cancel") {
      throw new Error("OVER_QUOTA_DECISION_REQUIRED");
    }
  }

  const leadMap = await collectLeadIdsForMatchKeys(
    input.resolutions.map((r) => r.matchKey),
  );

  if (preview.hasOverage && input.overQuotaDecision === "raise_city_capacity") {
    for (const cityPreview of preview.cities) {
      if (cityPreview.overBy <= 0 || cityPreview.cityId.startsWith("new:")) continue;
      const city = await getCityById(cityPreview.cityId);
      if (!city) continue;
      await updateCity(cityPreview.cityId, {
        capacity: city.capacity + cityPreview.overBy,
        actorId: input.actorId,
      });
      await logConfigChange({
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        entityType: "city",
        entityId: cityPreview.cityId,
        field: "city.capacity.raise_for_recount",
        oldValue: city.capacity,
        newValue: city.capacity + cityPreview.overBy,
      });
    }
  }

  if (preview.hasOverage && input.overQuotaDecision === "proceed_over_quota") {
    for (const cell of preview.cells.filter((c) => c.overBy > 0)) {
      await getSupabaseAdmin().from("quota_cell_over_quota").upsert(
        {
          state: cell.state,
          area_type: cell.areaType,
          flagged_at: new Date().toISOString(),
          flagged_by: input.actorId,
          reason: `Unmatched city recount exceeded cell by ${cell.overBy}`,
        },
        { onConflict: "state,area_type" },
      );
    }
  }

  for (const resolution of input.resolutions) {
    const leadIds = leadMap.get(resolution.matchKey) ?? [];
    if (leadIds.length === 0) continue;

    let targetCityId = resolution.cityId ?? "";
    let matchType: "exact" | "alias" = "alias";
    let sampleRaw = resolution.name ?? resolution.matchKey;

    if (resolution.action === "add_city") {
      const normalized = normalizeCityInput({
        name: resolution.name ?? "",
        state: resolution.state ?? "",
        areaType: resolution.areaType ?? "urban",
      });
      await ensureStateAllocation(normalized.state, input.actorId);

      const existing = await findCityByNameAndState(
        normalized.name,
        normalized.state,
      );
      if (existing) {
        targetCityId = existing.id;
        matchType = "exact";
        sampleRaw = normalized.name;
        await ensureUnmatchedAlias({
          cityId: existing.id,
          matchKey: resolution.matchKey,
          actorId: input.actorId,
        });
        await logConfigChange({
          actorId: input.actorId,
          actorEmail: input.actorEmail,
          entityType: "city",
          entityId: existing.id,
          field: "city.reused_from_unmatched",
          oldValue: null,
          newValue: `${existing.name} / ${existing.state} / ${existing.areaType}`,
        });
      } else {
        const snapshot = await buildQuotaSnapshot();
        let closesAt = resolution.capacity ?? 0;
        const previewCity = preview.cities.find(
          (c) => c.cityId === `new:${resolution.matchKey}`,
        );
        if (
          previewCity &&
          previewCity.incoming > closesAt &&
          input.overQuotaDecision === "raise_city_capacity"
        ) {
          closesAt = previewCity.afterAchieved;
        }
        validateCityClosesAt(
          snapshot,
          normalized.state,
          normalized.areaType,
          null,
          closesAt,
        );

        let created;
        try {
          created = await createCity({
            name: normalized.name,
            state: normalized.state,
            areaType: normalized.areaType,
            capacity: closesAt,
            actorId: input.actorId,
          });
        } catch (error) {
          if (!isDuplicateCityError(error)) throw error;
          const duplicate = await findCityByNameAndState(
            normalized.name,
            normalized.state,
          );
          if (!duplicate) throw error;
          created = duplicate;
          await ensureUnmatchedAlias({
            cityId: duplicate.id,
            matchKey: resolution.matchKey,
            actorId: input.actorId,
          });
        }
        targetCityId = created.id;
        matchType = "exact";
        sampleRaw = normalized.name;

        await logConfigChange({
          actorId: input.actorId,
          actorEmail: input.actorEmail,
          entityType: "city",
          entityId: created.id,
          field: "city.created_from_unmatched",
          oldValue: null,
          newValue: `${created.name} / ${created.state} / ${created.areaType}`,
        });
      }
    } else {
      if (!resolution.cityId) throw new Error("Missing alias target city.");
      const city = await getCityById(resolution.cityId);
      if (!city) throw new Error("Alias target city not found.");
      targetCityId = city.id;
      matchType = "alias";

      const rows = await loadUnmatchedScreenerRows();
      const sample = rows.find(
        (r) => rowMatchKey(String(r.city_raw ?? "")) === resolution.matchKey,
      );
      const displayAlias = sample?.city_raw?.trim() || resolution.matchKey;

      await createCityAlias({
        cityId: targetCityId,
        alias: normalizeCityDisplayName(displayAlias),
        matchKey: resolution.matchKey,
        actorId: input.actorId,
      });

      await logConfigChange({
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        entityType: "city_alias",
        entityId: targetCityId,
        field: "city_alias.created_from_unmatched",
        oldValue: null,
        newValue: `${displayAlias} → ${city.name}`,
      });
    }

    const city = await getCityById(targetCityId);
    if (!city) throw new Error("Target city missing after resolve.");

    await backfillResponses({
      leadIds,
      cityId: targetCityId,
      cityName: city.name,
      state: city.state,
      areaType: city.areaType,
      matchType,
    });

    await getSupabaseAdmin().from("city_unmatched_reviews").upsert(
      {
        match_key: resolution.matchKey,
        sample_raw: sampleRaw,
        status: "resolved",
        resolved_city_id: targetCityId,
        resolved_action: resolution.action,
        over_quota_decision: input.overQuotaDecision ?? null,
        actor_id: input.actorId,
        actor_email: input.actorEmail,
        response_count: leadIds.length,
        details: { matchType, leadIds },
        updated_at: new Date().toISOString(),
        restored_at: null,
      },
      { onConflict: "match_key" },
    );

    await logConfigChange({
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      entityType: "city_unmatched_resolve",
      entityId: targetCityId,
      field: "unmatched.resolve",
      oldValue: resolution.matchKey,
      newValue: JSON.stringify({
        action: resolution.action,
        city: city.name,
        state: city.state,
        areaType: city.areaType,
        matchType,
        responses: leadIds.length,
        overQuotaDecision: input.overQuotaDecision ?? null,
      }),
    });
  }

  return preview;
}

async function ensureUnmatchedAlias(input: {
  cityId: string;
  matchKey: string;
  actorId: string;
}) {
  const city = await getCityById(input.cityId);
  if (!city) return;
  if (rowMatchKey(city.name) === input.matchKey) return;

  const rows = await loadUnmatchedScreenerRows();
  const sample = rows.find(
    (r) => rowMatchKey(String(r.city_raw ?? "")) === input.matchKey,
  );
  const displayAlias = sample?.city_raw?.trim() || input.matchKey;
  await createCityAlias({
    cityId: input.cityId,
    alias: normalizeCityDisplayName(displayAlias),
    matchKey: input.matchKey,
    actorId: input.actorId,
  });
}

async function backfillResponses(input: {
  leadIds: string[];
  cityId: string;
  cityName: string;
  state: string;
  areaType: AreaType;
  matchType: "exact" | "alias";
}) {
  if (input.leadIds.length === 0) return;
  const admin = getSupabaseAdmin();

  const { error: screenerError } = await admin
    .from("screener_responses")
    .update({
      city_id: input.cityId,
      city_match_type: input.matchType,
      config_state: input.state,
      config_area_type: input.areaType,
    })
    .in("lead_id", input.leadIds)
    .eq("city_match_type", "unmatched")
    .eq("completion_status", "Completed");

  if (screenerError) throw screenerError;

  const { error: participantError } = await admin
    .from("participants")
    .update({
      city_id: input.cityId,
      city: input.cityName,
      city_match_type: input.matchType,
    })
    .in("lead_id", input.leadIds);

  if (participantError) throw participantError;

  const { error: ftvError } = await admin
    .from("ftv_responses")
    .update({ city_id: input.cityId })
    .in("lead_id", input.leadIds);

  if (ftvError && !/ftv_responses|PGRST205/i.test(ftvError.message)) {
    throw ftvError;
  }
}

export async function ignoreUnmatchedCity(input: {
  matchKey: string;
  sampleRaw: string;
  actorId: string;
  actorEmail: string;
}) {
  const leadMap = await collectLeadIdsForMatchKeys([input.matchKey]);
  const leadIds = leadMap.get(input.matchKey) ?? [];

  await getSupabaseAdmin().from("city_unmatched_reviews").upsert(
    {
      match_key: input.matchKey,
      sample_raw: input.sampleRaw,
      status: "ignored",
      resolved_city_id: null,
      resolved_action: "ignore",
      actor_id: input.actorId,
      actor_email: input.actorEmail,
      response_count: leadIds.length,
      details: { leadIds },
      updated_at: new Date().toISOString(),
      restored_at: null,
    },
    { onConflict: "match_key" },
  );

  await logConfigChange({
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    entityType: "city_unmatched_resolve",
    entityId: null,
    field: "unmatched.ignore",
    oldValue: input.sampleRaw,
    newValue: JSON.stringify({ matchKey: input.matchKey, responses: leadIds.length }),
  });
}

export async function restoreIgnoredUnmatchedCity(input: {
  matchKey: string;
  actorId: string;
  actorEmail: string;
}) {
  const { data, error } = await getSupabaseAdmin()
    .from("city_unmatched_reviews")
    .select("*")
    .eq("match_key", input.matchKey)
    .eq("status", "ignored")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Ignored entry not found.");

  await getSupabaseAdmin()
    .from("city_unmatched_reviews")
    .delete()
    .eq("match_key", input.matchKey)
    .eq("status", "ignored");

  await logConfigChange({
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    entityType: "city_unmatched_resolve",
    entityId: null,
    field: "unmatched.restore",
    oldValue: input.matchKey,
    newValue: (data as { sample_raw: string }).sample_raw,
  });
}

export async function listIgnoredUnmatchedCities() {
  const { data, error } = await getSupabaseAdmin()
    .from("city_unmatched_reviews")
    .select("match_key, sample_raw, response_count, created_at")
    .eq("status", "ignored")
    .is("restored_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    if (/city_unmatched_reviews|PGRST205|schema cache/i.test(error.message)) {
      return [];
    }
    throw error;
  }

  return ((data ?? []) as Array<{
    match_key: string;
    sample_raw: string;
    response_count: number;
    created_at: string;
  }>).map((row) => ({
    matchKey: row.match_key,
    sampleRaw: row.sample_raw,
    responseCount: row.response_count,
    ignoredAt: row.created_at,
  }));
}
