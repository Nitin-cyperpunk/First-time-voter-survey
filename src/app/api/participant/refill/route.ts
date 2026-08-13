import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { handleSubmissionRouteError } from "@/lib/api/submission-route";
import { getAuthenticatedParticipant } from "@/lib/auth/participant-session";
import { launchRegistrationSchema } from "@/features/launch/schemas/registration";
import { submitParticipantRefill } from "@/server/services/refill.service";

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
    const participant = await getAuthenticatedParticipant();
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!participant.refillRequired) {
      return NextResponse.json(
        { error: "Refill is not required." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = launchRegistrationSchema.safeParse({
      ...body,
      // Phone is locked — always use the authenticated participant mobile.
      mobile: participant.mobile,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }

    const result = await submitParticipantRefill(participant.leadId, parsed.data, {
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleSubmissionRouteError(error, "POST /api/participant/refill");
  }
}
