import { NextResponse, type NextRequest } from "next/server";

import { serveActiveFormHtml } from "@/lib/forms/serve-html";
import { getAuthenticatedParticipant } from "@/lib/auth/participant-session";
import { resolveLegacyReferralRedirect } from "@/lib/referral-routes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const participant = await getAuthenticatedParticipant();
  if (participant) {
    return NextResponse.redirect(new URL("/dashboard?welcomeBack=1", request.url));
  }

  const legacyRedirect = resolveLegacyReferralRedirect(
    request.nextUrl.searchParams.get("ref"),
    request.nextUrl.searchParams.get("platform"),
    request.nextUrl.origin,
  );
  if (legacyRedirect) return legacyRedirect;

  try {
    return await serveActiveFormHtml("registration");
  } catch (error) {
    console.error("GET / failed:", error);
    return serveActiveFormHtml("registration");
  }
}
