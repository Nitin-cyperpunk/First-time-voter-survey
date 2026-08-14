import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { previewUnmatchedResolve } from "@/server/services/unmatched-city-resolve.service";

export const dynamic = "force-dynamic";

const resolutionSchema = z.object({
  matchKey: z.string().min(1),
  action: z.enum(["add_city", "alias"]),
  cityId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  areaType: z.enum(["urban", "rural"]).optional(),
});

const bodySchema = z.object({
  resolutions: z.array(resolutionSchema).min(1).max(50),
});

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid preview payload." }, { status: 400 });
    }

    const preview = await previewUnmatchedResolve({
      resolutions: parsed.data.resolutions,
    });

    return NextResponse.json({ preview });
  } catch (error) {
    console.error("POST /api/admin/cities/unmatched/preview failed:", error);
    const message = error instanceof Error ? error.message : "Preview failed.";
    if (/city_unmatched_reviews|PGRST205|schema cache/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Migration 019 is pending. Run supabase/migrations/019_unmatched_city_resolve.sql.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
