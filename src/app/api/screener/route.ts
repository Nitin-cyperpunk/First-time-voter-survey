import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { handleSubmissionRouteError } from "@/lib/api/submission-route";
import {
  clearSessionCookie,
  revokeCurrentSession,
} from "@/lib/auth/participant-session";
import { registerParticipant } from "@/features/launch/services/register.service";
import { launchRegistrationSchema } from "@/features/launch/schemas/registration";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => issue.message).join(". ");
}

function getClientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = launchRegistrationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }

    const result = await registerParticipant(parsed.data, {
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    await revokeCurrentSession();

    const response = NextResponse.json(result, { status: 201 });
    return clearSessionCookie(response);
  } catch (error) {
    return handleSubmissionRouteError(error, "POST /api/screener");
  }
}
