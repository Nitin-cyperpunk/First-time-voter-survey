import { NextResponse } from "next/server";

import {
  getAuthenticatedParticipant,
  participantUnauthorizedResponse,
} from "@/lib/auth/participant-session";

export const dynamic = "force-dynamic";

/**
 * Validates the current HttpOnly session cookie against the database.
 * Used on app launch / login page for silent session restoration.
 * Never reads mobile or DOB from client storage — only the opaque token.
 */
export async function GET() {
  try {
    const participant = await getAuthenticatedParticipant();

    if (!participant) {
      return participantUnauthorizedResponse();
    }

    return NextResponse.json({
      authenticated: true,
      fullName: participant.fullName,
      status: participant.status,
      refillRequired: participant.refillRequired,
    });
  } catch (error) {
    console.error("GET /api/auth/session failed:", error);
    return participantUnauthorizedResponse(
      "Session validation failed.",
      "SESSION_ERROR",
    );
  }
}
