import { NextRequest, NextResponse } from "next/server";

import { establishParticipantSession } from "@/lib/auth/participant-session";
import { getAuthenticatedParticipant } from "@/lib/auth/participant-session";
import { serveRefillFormHtml } from "@/lib/forms/serve-html";
import { validateRefillTokenRecord } from "@/server/services/refill-request.service";

export const dynamic = "force-dynamic";

async function serveRefillWithSession(leadId: string) {
  const htmlResponse = await serveRefillFormHtml();
  const body = await htmlResponse.text();
  const response = new NextResponse(body, {
    status: htmlResponse.status,
    headers: htmlResponse.headers,
  });
  return establishParticipantSession(response, leadId, false);
}

/**
 * Public refill entry (mirrors /survey?t=...).
 * - /refill?t=<opaque> → validate token, establish session, serve form (no login).
 * - /refill (session) → logged-in dashboard users who already have a session.
 * Invalid token → /refill/invalid (never admin or participant login).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t")?.trim();

  if (token) {
    const validation = await validateRefillTokenRecord(token);
    if (!validation.valid) {
      return NextResponse.redirect(new URL("/refill/invalid", request.url));
    }

    try {
      return await serveRefillWithSession(validation.leadId);
    } catch (error) {
      console.error("GET /refill?t= failed:", error);
      return NextResponse.redirect(new URL("/refill/invalid", request.url));
    }
  }

  // Session path: participant already logged in (dashboard "Refill Registration").
  const participant = await getAuthenticatedParticipant();
  if (!participant) {
    return NextResponse.redirect(
      new URL("/login?sessionExpired=1", request.url),
    );
  }

  if (!participant.refillRequired) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  try {
    return await serveRefillWithSession(participant.leadId);
  } catch (error) {
    console.error("GET /refill failed:", error);
    return serveRefillFormHtml();
  }
}
