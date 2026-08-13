import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { recalculateCellTargets } from "@/server/services/quota.service";

export const dynamic = "force-dynamic";

const schema = z.object({
  state: z.string().trim().min(2),
  areaType: z.enum(["urban", "rural"]),
});

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid recalculate payload." }, { status: 400 });
    }

    await recalculateCellTargets({
      ...parsed.data,
      actorId: admin.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/quota/recalculate failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Recalculate failed." },
      { status: 400 },
    );
  }
}
