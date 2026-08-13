import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import {
  mapBulkLeadIdError,
  parseLeadIds,
} from "@/lib/bulk-selection/parse-lead-ids";
import { mapDmVerifyActionError } from "@/server/handlers/dm-verify-action.handler";
import { applyDmVerifyAction } from "@/server/services/dm-verify.service";
import { runBulkLeadAction } from "@/server/services/bulk-actions.service";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const leadIds = parseLeadIds(body);

    const result = await runBulkLeadAction(leadIds, async (leadId) => {
      await applyDmVerifyAction(leadId, "verify_participant");
    });

    return NextResponse.json({
      success: result.failed.length === 0,
      count: result.succeeded.length,
      succeeded: result.succeeded,
      failed: result.failed,
    });
  } catch (error) {
    console.error("POST /api/admin/bulk/verify failed:", error);
    const message =
      error instanceof Error && error.message.startsWith("INVALID")
        ? mapBulkLeadIdError(error)
        : mapDmVerifyActionError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
