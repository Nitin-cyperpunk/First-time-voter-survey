import { NextResponse } from "next/server";

import { getAuthenticatedParticipant } from "@/lib/auth/participant-session";

export async function GET() {
  try {
    const participant = await getAuthenticatedParticipant();
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!participant.refillRequired) {
      return NextResponse.json(
        { error: "Refill is not required for this participant." },
        { status: 400 },
      );
    }

    // Basics only — screener answers are cleared on refill request.
    // Phone is locked on the form; do not return admin refill reason.
    return NextResponse.json({
      fullName: participant.fullName,
      mobile: participant.mobile,
      dob: participant.dob,
      city: participant.city,
      city_id: participant.cityId,
      email: participant.email,
      area: participant.area,
      pincode: participant.pincode,
      phoneLocked: true,
    });
  } catch (error) {
    console.error("GET /api/participant/refill-context failed:", error);
    return NextResponse.json(
      { error: "Failed to load refill context." },
      { status: 500 },
    );
  }
}
