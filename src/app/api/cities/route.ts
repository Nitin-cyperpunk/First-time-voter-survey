import { NextResponse } from "next/server";

import { listSelectableCities } from "@/server/services/quota.service";

export const dynamic = "force-dynamic";

/**
 * Kept for admin/legacy. Respondent form no longer uses a city dropdown.
 * Prefer POST /api/cities/check for free-text capacity feedback.
 */
export async function GET() {
  try {
    const cities = await listSelectableCities();
    return NextResponse.json({ cities });
  } catch (error) {
    console.error("GET /api/cities failed:", error);
    return NextResponse.json({ cities: [] });
  }
}
