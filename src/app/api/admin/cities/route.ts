import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { INDIA_REGIONS } from "@/lib/india-states";
import { canAccess } from "@/lib/roles";
import { logConfigChange } from "@/server/repositories/config-audit.repository";
import { createCity } from "@/server/repositories/cities.repository";
import {
  countUnmatchedCompletions,
  listUnmatchedCityCounts,
} from "@/server/services/city-resolve.service";
import {
  buildQuotaSnapshot,
  ensureStateAllocation,
  normalizeCityInput,
  validateCityClosesAt,
} from "@/server/services/quota.service";

export const dynamic = "force-dynamic";

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
    let unmatchedCities: Array<{ raw: string; count: number; latestAt: string }> =
      [];
    let unmatchedGlobalCompletes = 0;
    try {
      unmatchedCities = await listUnmatchedCityCounts(40);
      unmatchedGlobalCompletes = await countUnmatchedCompletions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/city_raw|city_match_type|PGRST205|schema cache/i.test(message)) {
        throw error;
      }
    }
    return NextResponse.json({
      ...snapshot,
      regions: INDIA_REGIONS,
      totalCapacity: snapshot.totalCapacity,
      activeCityCapacitySum: snapshot.totalClosesAt,
      unallocated: snapshot.unallocated,
      unmatchedCities,
      unmatchedGlobalCompletes,
    });
  } catch (error) {
    console.error("GET /api/admin/cities failed:", error);
    const message = error instanceof Error ? error.message : "";
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
    return NextResponse.json({ error: "Failed to load cities." }, { status: 500 });
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

    const snapshot = await buildQuotaSnapshot();
    const closesAt = parsed.data.capacity ?? 0;
    try {
      validateCityClosesAt(
        snapshot,
        normalized.state,
        normalized.areaType,
        null,
        closesAt,
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Closes At exceeds cell." },
        { status: 400 },
      );
    }

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
