import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import {
  fetchCallDispositionsForAdmin,
  saveCallDispositions,
} from "@/server/services/call-dispositions.service";

function mapSaveError(error: unknown) {
  if (!(error instanceof Error)) return "Failed to save call dispositions.";
  if (error.message === "CALL_DISPOSITIONS_MIGRATION_PENDING") {
    return "Call dispositions migration is pending. Run supabase/migrations/025_call_dispositions.sql in Supabase.";
  }
  return error.message || "Failed to save call dispositions.";
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const config = await fetchCallDispositionsForAdmin();
    return NextResponse.json({ config });
  } catch (error) {
    console.error("GET /api/admin/call-dispositions failed:", error);
    return NextResponse.json(
      { error: "Failed to load call dispositions." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const config = await saveCallDispositions(body?.config ?? body);
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("PUT /api/admin/call-dispositions failed:", error);
    return NextResponse.json({ error: mapSaveError(error) }, { status: 400 });
  }
}
