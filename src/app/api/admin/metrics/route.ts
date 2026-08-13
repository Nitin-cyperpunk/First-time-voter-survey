import { NextResponse } from "next/server";

import { getDashboardMetrics } from "@/features/respondents/lib/dashboard-metrics";
import { isAdminAuthenticated } from "@/lib/auth/admin-session";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const metrics = await getDashboardMetrics();
    return NextResponse.json({ metrics });
  } catch (error) {
    console.error("GET /api/admin/metrics failed:", error);
    return NextResponse.json(
      { error: "Failed to load metrics." },
      { status: 500 },
    );
  }
}
