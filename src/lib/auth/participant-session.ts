import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  createSession,
  findSessionByToken,
  revokeActiveSessionsForLead,
  revokeSession,
  validateSession,
} from "@/server/repositories/sessions.repository";
import { findParticipantByLeadId } from "@/server/repositories/participants.repository";

export const PARTICIPANT_SESSION_COOKIE = "participant_session";

/** Persistent login when "Remember me" is enabled: 48 hours. */
export const SESSION_MAX_AGE_SECONDS = 48 * 60 * 60;

/** Standard login without "Remember me": ends when the browser session closes. */
export const SHORT_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/**
 * Shared cookie attributes. We intentionally store ONLY the opaque session
 * token — never mobile, DOB, or lead_id.
 */
function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function generateSessionToken() {
  return randomBytes(32).toString("hex");
}

export function getSessionExpiry(rememberMe: boolean) {
  const expiresAt = new Date();
  expiresAt.setSeconds(
    expiresAt.getSeconds() +
      (rememberMe ? SESSION_MAX_AGE_SECONDS : SHORT_SESSION_MAX_AGE_SECONDS),
  );
  return expiresAt;
}

/**
 * Creates a fresh session for a participant and attaches the cookie to the
 * outgoing response. Used by login so the participant can access the dashboard.
 */
export async function establishParticipantSession(
  response: NextResponse,
  leadId: string,
  rememberMe = false,
) {
  const token = generateSessionToken();
  const expiresAt = getSessionExpiry(rememberMe);

  await revokeActiveSessionsForLead(leadId);
  await createSession({ leadId, token, rememberMe, expiresAt });

  return attachSessionCookie(response, token, expiresAt, rememberMe);
}

export async function getSessionTokenFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get(PARTICIPANT_SESSION_COOKIE)?.value ?? null;
}

/**
 * Sets the session cookie directly on the outgoing response. This is the
 * reliable, runtime-agnostic way to emit Set-Cookie from a Route Handler
 * (next/headers cookie mutations are not always serialized on Netlify/edge).
 */
export function attachSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
  rememberMe: boolean,
) {
  const maxAge = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000),
  );

  const base = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };

  if (rememberMe) {
    response.cookies.set(PARTICIPANT_SESSION_COOKIE, token, {
      ...base,
      maxAge,
      expires: expiresAt,
    });
  } else {
    // Session cookie: valid until browser is closed (no Max-Age / Expires).
    response.cookies.set(PARTICIPANT_SESSION_COOKIE, token, base);
  }

  return response;
}

/** Clears the session cookie on the outgoing response. */
export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(PARTICIPANT_SESSION_COOKIE, "", {
    ...sessionCookieOptions(0),
    expires: new Date(0),
  });

  return response;
}

export async function getAuthenticatedParticipant() {
  const token = await getSessionTokenFromCookies();
  if (!token) return null;

  const session = await validateSession(token);
  if (!session?.lead_id) {
    return null;
  }

  const participant = await findParticipantByLeadId(session.lead_id);
  return participant ?? null;
}

/** JSON 401 with Set-Cookie clearing an invalid or expired participant session. */
export function participantUnauthorizedResponse(
  message = "Unauthorized.",
  code = "SESSION_EXPIRED",
) {
  const response = NextResponse.json({ error: message, code }, { status: 401 });
  return clearSessionCookie(response);
}

/**
 * Revokes the current session (cookie cleared by the route). Also revokes any
 * other active sessions for the same participant so logout is a clean, total
 * sign-out and a stale token can never silently re-authenticate the user.
 */
export async function revokeCurrentSession() {
  const token = await getSessionTokenFromCookies();
  if (!token) return;

  const session = await findSessionByToken(token);
  const leadId = session?.lead_id;

  await revokeSession(token);

  if (leadId) {
    try {
      await revokeActiveSessionsForLead(leadId);
    } catch (error) {
      console.error("Failed to revoke remaining sessions on logout:", error);
    }
  }
}
