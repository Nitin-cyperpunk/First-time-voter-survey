import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { mergeStudyConfig } from "@/lib/study-config/parse";
import { logConfigChange } from "@/server/repositories/config-audit.repository";
import { sumActiveCityCapacities } from "@/server/repositories/cities.repository";
import {
  getStudyConfig,
  updateStudyConfig,
} from "@/server/repositories/form-settings.repository";

function mapSaveError(error: unknown) {
  if (!(error instanceof Error)) return "Failed to save study config.";
  if (error.message === "STUDY_CONFIG_MIGRATION_PENDING") {
    return "Study config migration is pending. Run supabase/migrations/039_study_config.sql in Supabase.";
  }
  return error.message || "Failed to save study config.";
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const config = await getStudyConfig();
    return NextResponse.json({ config });
  } catch (error) {
    console.error("GET /api/admin/study-config failed:", error);
    return NextResponse.json(
      { error: "Failed to load study config." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const previous = await getStudyConfig();
    const config = mergeStudyConfig(body?.config ?? body);
    const activeSum = await sumActiveCityCapacities();
    if (activeSum > config.total_capacity) {
      return NextResponse.json(
        {
          error: `Sum of active city capacities (${activeSum}) exceeds total capacity (${config.total_capacity}). Unallocated would be ${config.total_capacity - activeSum}.`,
        },
        { status: 400 },
      );
    }

    const saved = await updateStudyConfig(config);

    if (previous.form_status !== saved.form_status) {
      await logConfigChange({
        actorId: admin.id,
        actorEmail: admin.email,
        entityType: "study_config",
        field: "form_status",
        oldValue: previous.form_status,
        newValue: saved.form_status,
      });
    }
    if (previous.total_capacity !== saved.total_capacity) {
      await logConfigChange({
        actorId: admin.id,
        actorEmail: admin.email,
        entityType: "study_config",
        field: "total_capacity",
        oldValue: previous.total_capacity,
        newValue: saved.total_capacity,
      });
    }
    if (previous.auto_close_on_full !== saved.auto_close_on_full) {
      await logConfigChange({
        actorId: admin.id,
        actorEmail: admin.email,
        entityType: "study_config",
        field: "auto_close_on_full",
        oldValue: previous.auto_close_on_full,
        newValue: saved.auto_close_on_full,
      });
    }

    return NextResponse.json({
      success: true,
      config: saved,
      activeCityCapacitySum: activeSum,
      unallocated: config.total_capacity - activeSum,
    });
  } catch (error) {
    console.error("PUT /api/admin/study-config failed:", error);
    return NextResponse.json({ error: mapSaveError(error) }, { status: 400 });
  }
}
