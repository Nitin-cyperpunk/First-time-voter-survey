import * as XLSX from "xlsx";

import { cityMatchKey, normalizeCityDisplayName } from "@/lib/city-resolve";
import {
  parseAreaType,
  resolveIndiaState,
  type AreaType,
} from "@/lib/india-states";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listCities } from "@/server/repositories/cities.repository";

export type ImportPreviewRow = {
  rowNumber: number;
  action: "add" | "update" | "reject";
  reason?: string;
  city: string;
  state: string;
  areaType: AreaType | "";
  capacity: number | null;
  aliases: string[];
  existingId?: string;
};

export type ImportPreview = {
  toAdd: ImportPreviewRow[];
  toUpdate: ImportPreviewRow[];
  rejected: ImportPreviewRow[];
};

function headerKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseAliases(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  return String(raw)
    .split(/[|;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseCityImportFile(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
}

export async function previewCityImport(
  rows: Record<string, unknown>[],
): Promise<ImportPreview> {
  const cities = await listCities();
  const byKey = new Map(
    cities.map((city) => [`${cityMatchKey(city.name)}|${city.state.toLowerCase()}`, city]),
  );
  const seenInFile = new Set<string>();

  const toAdd: ImportPreviewRow[] = [];
  const toUpdate: ImportPreviewRow[] = [];
  const rejected: ImportPreviewRow[] = [];

  rows.forEach((raw, index) => {
    const rowNumber = index + 2; // header is row 1
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      mapped[headerKey(key)] = value;
    }

    const cityRaw = String(
      mapped.city ?? mapped.cityname ?? mapped.name ?? "",
    ).trim();
    const stateRaw = String(mapped.state ?? mapped.stateut ?? "").trim();
    const areaRaw = String(
      mapped.areatype ?? mapped.area_type ?? mapped.area ?? "",
    ).trim();
    const capacityRaw = mapped.capacity ?? mapped.closesat ?? mapped.closes_at;
    const aliases = parseAliases(mapped.aliases ?? mapped.alias);

    const base: ImportPreviewRow = {
      rowNumber,
      action: "reject",
      city: cityRaw,
      state: stateRaw,
      areaType: "",
      capacity:
        capacityRaw === "" || capacityRaw == null
          ? null
          : Number(capacityRaw),
      aliases,
    };

    if (!cityRaw) {
      rejected.push({ ...base, reason: "Missing city name." });
      return;
    }
    const state = resolveIndiaState(stateRaw);
    if (!state) {
      rejected.push({ ...base, reason: "State must be a recognised India State/UT." });
      return;
    }
    const areaFold = areaRaw.toLowerCase().replace(/-/g, "_");
    if (!["urban", "rural", "local", "non_urban", "nonurban"].includes(areaFold)) {
      rejected.push({ ...base, reason: "area_type must be urban or rural." });
      return;
    }
    const areaType = parseAreaType(areaRaw);
    if (
      base.capacity != null &&
      (!Number.isFinite(base.capacity) || base.capacity < 0)
    ) {
      rejected.push({ ...base, reason: "capacity must be a non-negative integer." });
      return;
    }

    const name = normalizeCityDisplayName(cityRaw);
    const fileKey = `${cityMatchKey(name)}|${state.toLowerCase()}`;
    if (seenInFile.has(fileKey)) {
      rejected.push({
        ...base,
        city: name,
        state,
        areaType,
        reason: "Duplicate city+state in this file.",
      });
      return;
    }
    seenInFile.add(fileKey);

    const existing = byKey.get(fileKey);
    const row: ImportPreviewRow = {
      ...base,
      action: existing ? "update" : "add",
      city: name,
      state,
      areaType,
      existingId: existing?.id,
    };
    if (existing) toUpdate.push(row);
    else toAdd.push(row);
  });

  return { toAdd, toUpdate, rejected };
}

export async function commitCityImport(input: {
  preview: ImportPreview;
  actorId?: string | null;
  actorEmail?: string | null;
  fileName?: string | null;
}): Promise<{ added: number; updated: number; rejected: number }> {
  const admin = getSupabaseAdmin();
  let added = 0;
  let updated = 0;

  for (const row of input.preview.toAdd) {
    const match_key = cityMatchKey(row.city);
    const { data, error } = await admin
      .from("cities")
      .insert({
        name: row.city,
        state: row.state,
        area_type: row.areaType,
        capacity: row.capacity ?? 0,
        match_key,
        is_active: true,
        is_open: true,
        created_by: input.actorId ?? null,
        updated_by: input.actorId ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    added += 1;
    await upsertAliases(data.id, row.aliases, input.actorId);
  }

  for (const row of input.preview.toUpdate) {
    if (!row.existingId) continue;
    const patch: {
      name: string;
      state: string;
      area_type: AreaType;
      match_key: string;
      updated_by: string | null;
      capacity?: number;
    } = {
      name: row.city,
      state: row.state,
      area_type: row.areaType as AreaType,
      match_key: cityMatchKey(row.city),
      updated_by: input.actorId ?? null,
    };
    // Do not overwrite capacity unless the file provided one.
    if (row.capacity != null) patch.capacity = row.capacity;
    const { error } = await admin.from("cities").update(patch).eq("id", row.existingId);
    if (error) throw error;
    updated += 1;
    await upsertAliases(row.existingId, row.aliases, input.actorId);
  }

  const rejected = input.preview.rejected.length;
  await admin.from("city_import_log").insert({
    actor_id: input.actorId ?? null,
    actor_email: input.actorEmail ?? null,
    file_name: input.fileName ?? null,
    rows_added: added,
    rows_updated: updated,
    rows_rejected: rejected,
    details: {
      rejected: input.preview.rejected.map((r) => ({
        row: r.rowNumber,
        reason: r.reason,
        city: r.city,
        state: r.state,
      })),
    },
  });

  await admin.from("config_audit_log").insert({
    actor_id: input.actorId ?? null,
    actor_email: input.actorEmail ?? null,
    entity_type: "city_import",
    entity_id: null,
    field: "cities.bulk_import",
    old_value: null,
    new_value: `added ${added}, updated ${updated}, rejected ${rejected}`,
  });

  return { added, updated, rejected };
}

async function upsertAliases(
  cityId: string,
  aliases: string[],
  actorId?: string | null,
) {
  if (!aliases.length) return;
  const admin = getSupabaseAdmin();
  for (const alias of aliases) {
    const match_key = cityMatchKey(alias);
    if (!match_key) continue;
    await admin.from("city_aliases").upsert(
      {
        city_id: cityId,
        alias: normalizeCityDisplayName(alias),
        match_key,
        created_by: actorId ?? null,
      },
      { onConflict: "match_key" },
    );
  }
}
