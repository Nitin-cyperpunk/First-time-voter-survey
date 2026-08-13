import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import {
  markParticipantQc,
  type QcOutcome,
} from "@/server/services/qc.service";
import { InvalidStatusTransitionError } from "@/server/services/lifecycle.service";

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

function isQcOutcome(value: unknown): value is QcOutcome {
  return value === "pass" || value === "fail";
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { leadId } = await context.params;
    const body = await request.json();

    if (!isQcOutcome(body?.outcome)) {
      return NextResponse.json(
        { error: "Outcome must be pass or fail." },
        { status: 400 },
      );
    }

    const result = await markParticipantQc(leadId, body.outcome);
    return NextResponse.json({
      success: true,
      status: result.participant.status,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PARTICIPANT_NOT_FOUND") {
      return NextResponse.json(
        { error: "Participant not found." },
        { status: 404 },
      );
    }

    if (error instanceof InvalidStatusTransitionError) {
      return NextResponse.json(
        {
          error: `QC review requires status completed. Current status: ${error.fromStatus}.`,
          code: "INVALID_TRANSITION",
        },
        { status: 400 },
      );
    }

    console.error("PATCH /api/respondents/[leadId]/qc failed:", error);
    return NextResponse.json(
      { error: "Failed to update QC status." },
      { status: 500 },
    );
  }
}
