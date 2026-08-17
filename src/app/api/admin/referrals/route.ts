import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { listReferrals } from "@/server/repositories/admin.repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const referrerSearch = request.nextUrl.searchParams.get("referrer") ?? "";
    const rows = await listReferrals({
      referrerSearch: referrerSearch || undefined,
    });

    return NextResponse.json({
      rows: rows.map((row) => ({
        ...row,
        earnedAt: row.earnedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total: rows.length,
    });
  } catch (error) {
    console.error("GET /api/admin/referrals failed:", error);
    return NextResponse.json(
      { error: "Failed to load referrals." },
      { status: 500 },
    );
  }
}
