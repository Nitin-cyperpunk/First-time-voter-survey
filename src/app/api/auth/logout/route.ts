import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  revokeCurrentSession,
} from "@/lib/auth/participant-session";

export async function POST() {
  try {
    await revokeCurrentSession();

    const response = NextResponse.json({ success: true });
    return clearSessionCookie(response);
  } catch (error) {
    console.error("POST /api/auth/logout failed:", error);
    // Even if DB revocation fails, clear the cookie so the user is logged out.
    const response = NextResponse.json(
      { error: "Logout failed. Please try again." },
      { status: 500 },
    );
    return clearSessionCookie(response);
  }
}
