import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { isSuperAdmin } from "@/lib/roles";
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
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const includeDeleted =
    request.nextUrl.searchParams.get("include_deleted") === "1";
  if (includeDeleted && !isSuperAdmin(admin.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const leadIds = parseLeadIdsParam(request.nextUrl.searchParams);
    const bundle = await listFtvExportBundle(leadIds, { includeDeleted });
    return NextResponse.json(bundle);
  } catch (error) {
    console.error("GET /api/admin/screener-responses/export failed:", error);
    return NextResponse.json(
      { error: "Failed to export FTV responses." },
      { status: 500 },
    );
  }
}
