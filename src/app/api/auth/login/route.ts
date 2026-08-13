import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { launchLoginSchema } from "@/features/launch/schemas/registration";
import { normalizePhone } from "@/features/referrals/lib/registration";
import { findByMobileAndDob } from "@/server/repositories/participants.repository";
import { establishParticipantSession } from "@/lib/auth/participant-session";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => issue.message).join(". ");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = launchLoginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }

    const mobile = normalizePhone(parsed.data.mobile);
    const participant = await findByMobileAndDob(mobile, parsed.data.dob);

    if (!participant) {
      return NextResponse.json(
        { error: "Invalid mobile number or date of birth." },
        { status: 401 },
      );
    }

    const rememberMe = parsed.data.rememberMe ?? false;

    const response = NextResponse.json({
      fullName: participant.fullName,
      status: participant.status,
    });

    return await establishParticipantSession(
      response,
      participant.leadId,
      rememberMe,
    );
  } catch (error) {
    console.error("POST /api/auth/login failed:", error);
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500 },
    );
  }
}
