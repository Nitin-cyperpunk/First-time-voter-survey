import { NextRequest, NextResponse } from "next/server";

import { normalizePhone } from "@/features/referrals/lib/registration";
import { findByMobile } from "@/server/repositories/participants.repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get("mobile") ?? "";
    const mobile = normalizePhone(raw);

    if (mobile.length < 10) {
      return NextResponse.json({ exists: false });
    }

    const existing = await findByMobile(mobile);
    return NextResponse.json({ exists: Boolean(existing) });
  } catch (error) {
    console.error("GET /api/participant/check-mobile failed:", error);
    // Never block registration on a lookup failure.
    return NextResponse.json({ exists: false });
  }
}
