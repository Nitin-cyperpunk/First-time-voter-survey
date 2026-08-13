import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import {
  mapBulkLeadIdError,
  parseLeadIds,
} from "@/lib/bulk-selection/parse-lead-ids";
import { findParticipantByLeadId } from "@/server/repositories/participants.repository";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const leadIds = parseLeadIds(body);

    const missing: string[] = [];
    for (const leadId of leadIds) {
      const participant = await findParticipantByLeadId(leadId);
      if (!participant) {
        missing.push(leadId);
      }
    }

    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "Some participants were not found.",
          missingLeadIds: missing,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      count: leadIds.length,
      lead_ids: leadIds,
    });
  } catch (error) {
    console.error("POST /api/admin/bulk/message failed:", error);
    return NextResponse.json(
      { error: mapBulkLeadIdError(error) },
      { status: 400 },
    );
  }
}
