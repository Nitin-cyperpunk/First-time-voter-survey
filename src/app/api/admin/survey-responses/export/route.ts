import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { listSurveyExportRows } from "@/server/repositories/survey-export.repository";

function parseLeadIdsParam(searchParams: URLSearchParams): string[] | undefined {
  const raw = searchParams.get("lead_ids");
  if (!raw) return undefined;

  const ids = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return ids.length > 0 ? ids : undefined;
}

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const leadIds = parseLeadIdsParam(request.nextUrl.searchParams);
    const rows = await listSurveyExportRows({ leadIds });
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("GET /api/admin/survey-responses/export failed:", error);
    return NextResponse.json(
      { error: "Failed to export survey responses." },
      { status: 500 },
    );
  }
}
