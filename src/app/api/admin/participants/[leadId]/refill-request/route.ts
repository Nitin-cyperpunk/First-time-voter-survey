import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { requestParticipantRefill } from "@/server/services/refill-request.service";

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { leadId } = await context.params;
    const body = await request.json();
    const reason = String(body?.reason ?? "").trim();

    if (!reason) {
      return NextResponse.json(
        { error: "A refill reason is required." },
        { status: 400 },
      );
    }

    const result = await requestParticipantRefill(leadId, reason);

    return NextResponse.json({
      success: true,
      refillRequired: result.participant.refillRequired,
      refillReason: result.participant.refillReason,
      refillToken: result.refillToken,
      refillUrl: result.refillUrl,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PARTICIPANT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Participant not found." },
          { status: 404 },
        );
      }
      if (error.message === "REFILL_TOKEN_GENERATION_FAILED") {
        return NextResponse.json(
          { error: "Could not generate a secure refill link. Try again." },
          { status: 500 },
        );
      }
    }

    console.error(
      "POST /api/admin/participants/[leadId]/refill-request failed:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to request refill." },
      { status: 500 },
    );
  }
}
