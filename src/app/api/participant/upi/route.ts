import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedParticipant } from "@/lib/auth/participant-session";
import { isValidUpiId, normalizeUpiId } from "@/lib/upi";
import { updateParticipantUpi } from "@/server/repositories/participants.repository";

export const dynamic = "force-dynamic";

const upiSchema = z.object({
  upiId: z.string().trim().min(1, "UPI ID is required."),
});

export async function POST(request: NextRequest) {
  try {
    const participant = await getAuthenticatedParticipant();
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const parsed = upiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid UPI ID." },
        { status: 400 },
      );
    }

    const normalized = normalizeUpiId(parsed.data.upiId);
    if (!isValidUpiId(normalized)) {
      return NextResponse.json(
        { error: "Invalid UPI ID format.", code: "INVALID_UPI" },
        { status: 400 },
      );
    }

    const updated = await updateParticipantUpi(participant.leadId, normalized);
    if (!updated) {
      return NextResponse.json(
        { error: "Participant not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      upiId: updated.upiId,
      upiSubmittedAt: updated.upiSubmittedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("POST /api/participant/upi failed:", error);
    return NextResponse.json(
      { error: "Failed to save UPI ID." },
      { status: 500 },
    );
  }
}
