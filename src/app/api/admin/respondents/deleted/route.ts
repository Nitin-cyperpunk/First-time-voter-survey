import { NextResponse } from "next/server";

import { withSuperAdmin } from "@/lib/auth/api-guard";
import { listDeletedRespondents } from "@/server/services/respondent-delete.service";

export const dynamic = "force-dynamic";

export const GET = withSuperAdmin(async () => {
  try {
    const respondents = await listDeletedRespondents();
    return NextResponse.json({ respondents });
  } catch (error) {
    console.error("GET /api/admin/respondents/deleted failed:", error);
    return NextResponse.json(
      { error: "Failed to load deleted respondents." },
      { status: 500 },
    );
  }
});
