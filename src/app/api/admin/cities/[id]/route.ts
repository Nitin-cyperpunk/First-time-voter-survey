import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";
import { logConfigChange } from "@/server/repositories/config-audit.repository";
import {
  deleteCity,
  getCityById,
  listCities,
  sumActiveCityCapacities,
  updateCity,
} from "@/server/repositories/cities.repository";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  areaType: z.enum(["urban", "local"]).optional(),
  capacity: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await getCityById(id);
  if (!existing) {
    return NextResponse.json({ error: "City not found." }, { status: 404 });
  }

  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid city payload." }, { status: 400 });
    }

    const nextActive = parsed.data.isActive ?? existing.isActive;
    const nextCapacity = parsed.data.capacity ?? existing.capacity;
    const cities = await listCities();
    const activeSum = cities.reduce((sum, city) => {
      if (city.id === id) {
        return nextActive ? sum + nextCapacity : sum;
      }
      return city.isActive ? sum + city.capacity : sum;
    }, 0);

    const config = await getStudyConfig();
    if (activeSum > config.total_capacity) {
      return NextResponse.json(
        {
          error: `Active city capacities would be ${activeSum}, which exceeds total capacity (${config.total_capacity}).`,
        },
        { status: 400 },
      );
    }

    const saved = await updateCity(id, {
      ...parsed.data,
      actorId: admin.id,
    });

    if (existing.capacity !== saved.capacity) {
      await logConfigChange({
        actorId: admin.id,
        actorEmail: admin.email,
        entityType: "city",
        entityId: id,
        field: "city.capacity",
        oldValue: existing.capacity,
        newValue: saved.capacity,
      });
    }
    if (existing.isActive !== saved.isActive) {
      await logConfigChange({
        actorId: admin.id,
        actorEmail: admin.email,
        entityType: "city",
        entityId: id,
        field: "city.is_active",
        oldValue: existing.isActive,
        newValue: saved.isActive,
      });
    }

    return NextResponse.json({ city: saved, activeCityCapacitySum: activeSum });
  } catch (error) {
    console.error("PATCH /api/admin/cities/[id] failed:", error);
    return NextResponse.json({ error: "Failed to update city." }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await getCityById(id);
  if (!existing) {
    return NextResponse.json({ error: "City not found." }, { status: 404 });
  }

  try {
    await deleteCity(id);
    await logConfigChange({
      actorId: admin.id,
      actorEmail: admin.email,
      entityType: "city",
      entityId: id,
      field: "city.deleted",
      oldValue: `${existing.name} / ${existing.state}`,
      newValue: null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "CITY_HAS_RESPONSES") {
      return NextResponse.json(
        {
          error:
            "This city has responses and cannot be deleted. Deactivate it instead.",
        },
        { status: 409 },
      );
    }
    console.error("DELETE /api/admin/cities/[id] failed:", error);
    return NextResponse.json({ error: "Failed to delete city." }, { status: 400 });
  }
}
