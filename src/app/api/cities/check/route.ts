import { NextResponse } from "next/server";
import { z } from "zod";

import { checkCityAvailability } from "@/server/services/city-resolve.service";

export const dynamic = "force-dynamic";

const schema = z.object({
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().max(80).optional(),
});

/** Public blur-check: open/closed only — never remaining counts. */
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "city_required", message: "Please enter your city." },
        { status: 400 },
      );
    }

    const result = await checkCityAvailability({
      cityRaw: parsed.data.city,
      stateLabel: parsed.data.state,
    });

    return NextResponse.json({
      ok: result.ok,
      code: result.code,
      message: result.message,
      matchType: result.resolved.matchType,
      // Never expose remaining slots — open/closed only.
      closed: Boolean(result.resolved.isFull || !result.resolved.isOpen),
    });
  } catch (error) {
    console.error("POST /api/cities/check failed:", error);
    return NextResponse.json({ ok: true });
  }
}
