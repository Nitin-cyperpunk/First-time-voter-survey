import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { logConfigChange } from "@/server/repositories/config-audit.repository";
import {
  getStudyConfig,
  updateStudyConfig,
} from "@/server/repositories/form-settings.repository";
import { saveStateAllocations } from "@/server/services/quota.service";

export const dynamic = "force-dynamic";

const schema = z.object({
  urbanNonUrbanPct: z.number().int().min(0).max(100).optional(),
  reallocation: z
    .object({
      minFillPct: z.number().int().min(0).max(100),
      afterDays: z.number().int().min(0).max(3650),
      maxTransferPctOfRemaining: z.number().int().min(0).max(100),
    })
    .optional(),
  states: z
    .array(
      z.object({
        state: z.string().trim().min(2),
        allocation: z.number().int().min(0).max(10_000),
        allocationManual: z.boolean(),
        urbanPct: z.number().int().min(0).max(100),
        urbanPctManual: z.boolean(),
      }),
    )
    .optional(),
});

export async function PUT(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid quota payload." }, { status: 400 });
    }

    const previous = await getStudyConfig();
    const next = { ...previous };
    if (parsed.data.urbanNonUrbanPct != null) {
      next.urban_non_urban_pct = parsed.data.urbanNonUrbanPct;
    }
    if (parsed.data.reallocation) {
      next.quota_reallocation_min_fill_pct = parsed.data.reallocation.minFillPct;
      next.quota_reallocation_after_days = parsed.data.reallocation.afterDays;
      next.quota_reallocation_max_transfer_pct =
        parsed.data.reallocation.maxTransferPctOfRemaining;
    }

    if (parsed.data.states) {
      await saveStateAllocations({
        states: parsed.data.states,
        actorId: admin.id,
      });
      await logConfigChange({
        actorId: admin.id,
        actorEmail: admin.email,
        entityType: "state_quota",
        field: "state.allocations",
        oldValue: previous.total_capacity,
        newValue: parsed.data.states
          .map((row) => `${row.state}:${row.allocation}`)
          .join(","),
      });
    }

    const saved = await updateStudyConfig(next);
    if (previous.urban_non_urban_pct !== saved.urban_non_urban_pct) {
      await logConfigChange({
        actorId: admin.id,
        actorEmail: admin.email,
        entityType: "study_config",
        field: "urban_non_urban_pct",
        oldValue: previous.urban_non_urban_pct,
        newValue: saved.urban_non_urban_pct,
      });
    }

    return NextResponse.json({ ok: true, config: saved });
  } catch (error) {
    console.error("PUT /api/admin/quota failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save quota." },
      { status: 400 },
    );
  }
}
