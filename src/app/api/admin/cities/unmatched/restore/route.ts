import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { restoreIgnoredUnmatchedCity } from "@/server/services/unmatched-city-resolve.service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  matchKey: z.string().min(1),
});

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid restore payload." }, { status: 400 });
    }

    await restoreIgnoredUnmatchedCity({
      matchKey: parsed.data.matchKey,
      actorId: admin.id,
      actorEmail: admin.email,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/cities/unmatched/restore failed:", error);
    const message = error instanceof Error ? error.message : "Restore failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
