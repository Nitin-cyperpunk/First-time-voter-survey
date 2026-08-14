import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { commitUnmatchedResolve } from "@/server/services/unmatched-city-resolve.service";

export const dynamic = "force-dynamic";

const resolutionSchema = z.object({
  matchKey: z.string().min(1),
  action: z.enum(["add_city", "alias"]),
  cityId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  areaType: z.enum(["urban", "rural"]).optional(),
  capacity: z.number().int().min(0).max(10_000).optional(),
});

const bodySchema = z.object({
  resolutions: z.array(resolutionSchema).min(1).max(50),
  overQuotaDecision: z
    .enum(["raise_city_capacity", "proceed_over_quota", "cancel"])
    .optional(),
});

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid resolve payload." }, { status: 400 });
    }

    const preview = await commitUnmatchedResolve({
      actorId: admin.id,
      actorEmail: admin.email,
      resolutions: parsed.data.resolutions,
      overQuotaDecision: parsed.data.overQuotaDecision,
    });

    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    console.error("POST /api/admin/cities/unmatched/resolve failed:", error);
    const message = error instanceof Error ? error.message : "Resolve failed.";
    if (message === "OVER_QUOTA_DECISION_REQUIRED") {
      return NextResponse.json(
        {
          error:
            "This resolution would exceed a quota cell or city cap. Preview again and choose how to proceed.",
          code: "OVER_QUOTA_DECISION_REQUIRED",
        },
        { status: 409 },
      );
    }
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
