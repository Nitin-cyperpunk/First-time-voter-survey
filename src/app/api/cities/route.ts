import { NextResponse } from "next/server";

import { listSelectableCities } from "@/server/services/quota.service";

export const dynamic = "force-dynamic";

/**
 * Kept for admin/legacy. Respondent form no longer uses a city dropdown.
 * Cities at or over cities.capacity are omitted when enforce_capacity is on.
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
