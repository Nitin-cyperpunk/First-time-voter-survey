import { NextResponse } from "next/server";

import { listSelectableCities } from "@/server/repositories/cities.repository";

export const dynamic = "force-dynamic";

/** Public: active, non-full cities for the respondent city selector. */
export async function GET() {
  try {
    const cities = await listSelectableCities();
    return NextResponse.json({ cities });
  } catch (error) {
    console.error("GET /api/cities failed:", error);
    return NextResponse.json({ cities: [] });
  }
}
