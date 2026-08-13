import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";
import { logConfigChange } from "@/server/repositories/config-audit.repository";
import {
  createCity,
  listCitiesWithCapacity,
  sumActiveCityCapacities,
} from "@/server/repositories/cities.repository";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  areaType: z.enum(["urban", "local"]),
  capacity: z.number().int().min(0).max(10_000),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const [cities, config] = await Promise.all([
      listCitiesWithCapacity(),
      getStudyConfig(),
    ]);
    const activeSum = cities
      .filter((city) => city.isActive)
      .reduce((sum, city) => sum + city.capacity, 0);
    return NextResponse.json({
      cities,
      totalCapacity: config.total_capacity,
      activeCityCapacitySum: activeSum,
      unallocated: config.total_capacity - activeSum,
    });
  } catch (error) {
    console.error("GET /api/admin/cities failed:", error);
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

    const config = await getStudyConfig();
    const wouldBeActive = parsed.data.isActive !== false;
    const activeSum = await sumActiveCityCapacities();
    const nextSum = activeSum + (wouldBeActive ? parsed.data.capacity : 0);
    if (nextSum > config.total_capacity) {
      return NextResponse.json(
        {
          error: `Active city capacities would be ${nextSum}, which exceeds total capacity (${config.total_capacity}). Unallocated: ${config.total_capacity - activeSum}.`,
        },
        { status: 400 },
      );
    }

    const city = await createCity({
      ...parsed.data,
      actorId: admin.id,
    });

    await logConfigChange({
      actorId: admin.id,
      actorEmail: admin.email,
      entityType: "city",
      entityId: city.id,
      field: "city.created",
      oldValue: null,
      newValue: `${city.name} / ${city.state} / ${city.areaType} / cap ${city.capacity}`,
    });

    return NextResponse.json({ city }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/cities failed:", error);
    return NextResponse.json({ error: "Failed to create city." }, { status: 400 });
  }
}
