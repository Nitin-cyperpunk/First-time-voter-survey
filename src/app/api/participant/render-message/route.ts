import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedParticipant } from "@/lib/auth/participant-session";
import {
  parseReferralPlatform,
  renderParticipantMessage,
} from "@/server/services/participant-message.service";

export async function GET(request: NextRequest) {
  try {
    const participant = await getAuthenticatedParticipant();
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const templateKey = request.nextUrl.searchParams.get("key")?.trim() ?? "";
    if (!templateKey) {
      return NextResponse.json(
        { error: "Template key is required." },
        { status: 400 },
      );
    }

    const platform = parseReferralPlatform(
      request.nextUrl.searchParams.get("platform"),
    );

    const rendered = await renderParticipantMessage(participant, templateKey, {
      platform,
    });

    return NextResponse.json(rendered);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_TEMPLATE_KEY") {
      return NextResponse.json(
        { error: "Unknown message template." },
        { status: 400 },
      );
    }

    console.error("GET /api/participant/render-message failed:", error);
    return NextResponse.json(
      { error: "Failed to render message." },
      { status: 500 },
    );
  }
}
