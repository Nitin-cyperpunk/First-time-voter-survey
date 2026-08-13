import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { reallocateCell } from "@/server/services/quota.service";

export const dynamic = "force-dynamic";

const schema = z.object({
  fromState: z.string().trim().min(2),
  fromAreaType: z.enum(["urban", "rural"]),
  toState: z.string().trim().min(2),
  toAreaType: z.enum(["urban", "rural"]),
  amount: z.number().int().min(1).max(10_000),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid reallocation payload." }, { status: 400 });
    }

    await reallocateCell({
      ...parsed.data,
      actorId: admin.id,
      actorEmail: admin.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/quota/reallocate failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reallocation failed." },
      { status: 400 },
    );
  }
}
