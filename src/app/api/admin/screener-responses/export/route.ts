import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { listFtvExportBundle } from "@/server/repositories/ftv-export.repository";

export const dynamic = "force-dynamic";

function parseLeadIdsParam(searchParams: URLSearchParams): string[] | undefined {
  const raw = searchParams.get("lead_ids");
  if (!raw) return undefined;

  const ids = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return ids.length > 0 ? ids : undefined;
}

/** Alias of /api/admin/ftv-responses/export — FTV wide export, not screener. */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const leadIds = parseLeadIdsParam(request.nextUrl.searchParams);
    const bundle = await listFtvExportBundle(leadIds);
    return NextResponse.json(bundle);
  } catch (error) {
    console.error("GET /api/admin/screener-responses/export failed:", error);
    return NextResponse.json(
      { error: "Failed to export FTV responses." },
      { status: 500 },
    );
  }
}
