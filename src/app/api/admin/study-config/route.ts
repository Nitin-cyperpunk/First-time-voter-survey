import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { mergeStudyConfig } from "@/lib/study-config/parse";
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
    const config = mergeStudyConfig(body?.config ?? body);
    const saved = await updateStudyConfig(config);
    return NextResponse.json({ success: true, config: saved });
  } catch (error) {
    console.error("PUT /api/admin/study-config failed:", error);
    return NextResponse.json({ error: mapSaveError(error) }, { status: 400 });
  }
}
