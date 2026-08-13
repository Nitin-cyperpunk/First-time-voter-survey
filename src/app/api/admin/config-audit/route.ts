import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import { listConfigAuditLog } from "@/server/repositories/config-audit.repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const entries = await listConfigAuditLog(150);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("GET /api/admin/config-audit failed:", error);
    return NextResponse.json({ error: "Failed to load audit log." }, { status: 500 });
  }
}
