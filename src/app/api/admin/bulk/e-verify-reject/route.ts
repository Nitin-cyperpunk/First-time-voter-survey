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
    const reason = String(body?.reason ?? "").trim();

    const result = await runBulkLeadAction(leadIds, async (leadId) => {
      await setAdminEligibility(leadId, "not_eligible", reason);
    });

    return NextResponse.json({
      success: result.failed.length === 0,
      count: result.succeeded.length,
      succeeded: result.succeeded,
      failed: result.failed,
    });
  } catch (error) {
    console.error("POST /api/admin/bulk/e-verify-reject failed:", error);
    return NextResponse.json(
      { error: mapBulkLeadIdError(error) },
      { status: 400 },
    );
  }
}
