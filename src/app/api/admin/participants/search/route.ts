import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { searchParticipants } from "@/server/repositories/participants.repository";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const results = await searchParticipants(query);

    return NextResponse.json({
      results: results.map((participant) => ({
        leadId: participant.leadId,
        fullName: participant.fullName,
        mobile: participant.mobile,
        referralCode: participant.referralCode,
        status: participant.status,
        instagramId: participant.instagramId,
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/participants/search failed:", error);
    return NextResponse.json(
      { error: "Search failed." },
      { status: 500 },
    );
  }
}
