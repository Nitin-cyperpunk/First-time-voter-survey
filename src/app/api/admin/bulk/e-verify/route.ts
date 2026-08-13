import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import {
  mapBulkLeadIdError,
  parseLeadIds,
} from "@/lib/bulk-selection/parse-lead-ids";
import { runBulkLeadAction } from "@/server/services/bulk-actions.service";
import { setAdminEligibility } from "@/server/services/eligibility-override.service";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const leadIds = parseLeadIds(body);
    const reason = String(body?.reason ?? "Bulk e-verify approval").trim();

    if (!reason) {
      return NextResponse.json(
        { error: "An eligibility reason is required." },
        { status: 400 },
      );
    }

    const result = await runBulkLeadAction(leadIds, async (leadId) => {
      await setAdminEligibility(leadId, "eligible", reason);
    });

    return NextResponse.json({
      success: result.failed.length === 0,
      count: result.succeeded.length,
      succeeded: result.succeeded,
      failed: result.failed,
    });
  } catch (error) {
    console.error("POST /api/admin/bulk/e-verify failed:", error);
    return NextResponse.json(
      { error: mapBulkLeadIdError(error) },
      { status: 400 },
    );
  }
}
