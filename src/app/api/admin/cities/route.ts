import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { INDIA_REGIONS } from "@/lib/india-states";
import { canAccess } from "@/lib/roles";
import { logConfigChange } from "@/server/repositories/config-audit.repository";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";
import { createCity } from "@/server/repositories/cities.repository";
import {
  countActiveUnmatchedCompletes,
  listIgnoredUnmatchedCities,
  listUnmatchedCityRows,
} from "@/server/services/unmatched-city-resolve.service";
import {
  buildQuotaSnapshot,
  ensureStateAllocation,
  normalizeCityInput,
} from "@/server/services/quota.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const row = error as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    const parts = [row.message, row.code, row.details, row.hint].filter(
      (part): part is string => Boolean(part && part.trim()),
    );
    if (parts.length > 0) return parts.join(" — ");
  }
  return "";
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  areaType: z.enum(["urban", "rural", "non_urban", "local"]),
  capacity: z.number().int().min(0).max(10_000).optional(),
  buffer: z.number().int().min(0).max(10_000).optional(),
  isOpen: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const snapshot = await buildQuotaSnapshot();
    let unmatchedCities: Awaited<ReturnType<typeof listUnmatchedCityRows>> = [];
    let unmatchedGlobalCompletes = 0;
    let ignoredUnmatched: Awaited<ReturnType<typeof listIgnoredUnmatchedCities>> = [];
    try {
      unmatchedCities = await listUnmatchedCityRows(40);
      unmatchedGlobalCompletes = await countActiveUnmatchedCompletes();
    } catch (error) {
      console.warn("Unmatched city list unavailable:", error);
    }
    try {
      ignoredUnmatched = await listIgnoredUnmatchedCities();
    } catch {
      /* migration 019 may be pending */
    }
    return NextResponse.json({
      ...snapshot,
      regions: INDIA_REGIONS,
      totalCapacity: snapshot.totalCapacity,
      activeCityCapacitySum: snapshot.totalClosesAt,
      unallocated: snapshot.unallocated,
      unmatchedCities,
      unmatchedGlobalCompletes,
      ignoredUnmatched,
      defaultCityCapacity: (await getStudyConfig()).default_city_capacity,
    });
  } catch (error) {
    console.error("GET /api/admin/cities failed:", error);
    const message = describeError(error);
    if (/study_state_allocations|quota_cell|PGRST205|schema cache/i.test(message)) {
      return NextResponse.json(
        { error: "Quota migration 013 is pending. Run supabase/migrations/013_state_area_quota.sql." },
        { status: 503 },
      );
    }
    if (/city_aliases|match_key|city_import_log|PGRST205|schema cache/i.test(message)) {
      return NextResponse.json(
        { error: "City resolve migration 015 is pending. Run supabase/migrations/015_free_text_city_resolve.sql." },
        { status: 503 },
      );
    }
    if (/timeout|fetch failed|UND_ERR|SocketError|ConnectTimeout/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Could not reach Supabase (timeout). Check the network and retry City Targets.",
        },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: message || "Failed to load cities." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid city payload." }, { status: 400 });
    }

    let normalized;
    try {
      normalized = normalizeCityInput(parsed.data);
    } catch {
      return NextResponse.json(
        { error: "State must be a Q15_1 India State / UT label." },
        { status: 400 },
      );
    }

    const config = await getStudyConfig();
    const closesAt = parsed.data.capacity ?? config.default_city_capacity;

    await ensureStateAllocation(normalized.state, admin.id);

    const city = await createCity({
      name: normalized.name,
      state: normalized.state,
      areaType: normalized.areaType,
      capacity: closesAt,
      buffer: parsed.data.buffer ?? 0,
      isOpen: parsed.data.isOpen,
      isActive: parsed.data.isActive,
      actorId: admin.id,
    });

    await logConfigChange({
      actorId: admin.id,
      actorEmail: admin.email,
      entityType: "city",
      entityId: city.id,
      field: "city.created",
      oldValue: null,
      newValue: `${city.name} / ${city.state} / ${city.areaType} / closes ${city.capacity}`,
    });

    return NextResponse.json({ city }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/cities failed:", error);
    const message = error instanceof Error ? error.message : "Failed to create city.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
