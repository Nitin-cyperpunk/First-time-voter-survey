import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { logConfigChange } from "@/server/repositories/config-audit.repository";
import {
  deleteCity,
  getCityById,
  updateCity,
} from "@/server/repositories/cities.repository";
import {
  buildQuotaSnapshot,
  ensureStateAllocation,
  normalizeCityInput,
  validateCityClosesAt,
} from "@/server/services/quota.service";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  areaType: z.enum(["urban", "rural", "non_urban", "local"]).optional(),
  capacity: z.number().int().min(0).max(10_000).optional(),
  buffer: z.number().int().min(0).max(10_000).optional(),
  isOpen: z.boolean().optional(),
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

    let nextName = existing.name;
    let nextState = existing.state;
    let nextArea = existing.areaType;
    if (
      parsed.data.name !== undefined ||
      parsed.data.state !== undefined ||
      parsed.data.areaType !== undefined
    ) {
      try {
        const normalized = normalizeCityInput({
          name: parsed.data.name ?? existing.name,
          state: parsed.data.state ?? existing.state,
          areaType: parsed.data.areaType ?? existing.areaType,
        });
        nextName = normalized.name;
        nextState = normalized.state;
        nextArea = normalized.areaType;
      } catch {
        return NextResponse.json(
          { error: "State must be a Q15_1 India State / UT label." },
          { status: 400 },
        );
      }
    }

    const nextClosesAt = parsed.data.capacity ?? existing.capacity;
    const snapshot = await buildQuotaSnapshot();
    try {
      validateCityClosesAt(snapshot, nextState, nextArea, id, nextClosesAt);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Closes At exceeds cell." },
        { status: 400 },
      );
    }

    if (nextState !== existing.state) {
      await ensureStateAllocation(nextState, admin.id);
    }

    const saved = await updateCity(id, {
      name: parsed.data.name !== undefined ? nextName : undefined,
      state: parsed.data.state !== undefined ? nextState : undefined,
      areaType: parsed.data.areaType !== undefined ? nextArea : undefined,
      capacity: parsed.data.capacity,
      buffer: parsed.data.buffer,
      isOpen: parsed.data.isOpen,
      isActive: parsed.data.isActive,
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
    if (existing.buffer !== saved.buffer) {
      await logConfigChange({
        actorId: admin.id,
        actorEmail: admin.email,
        entityType: "city",
        entityId: id,
        field: "city.buffer",
        oldValue: existing.buffer,
        newValue: saved.buffer,
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
    if (existing.isOpen !== saved.isOpen) {
      await logConfigChange({
        actorId: admin.id,
        actorEmail: admin.email,
        entityType: "city",
        entityId: id,
        field: "city.is_open",
        oldValue: existing.isOpen,
        newValue: saved.isOpen,
      });
    }

    return NextResponse.json({ city: saved });
  } catch (error) {
    console.error("PATCH /api/admin/cities/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update city." },
      { status: 400 },
    );
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
