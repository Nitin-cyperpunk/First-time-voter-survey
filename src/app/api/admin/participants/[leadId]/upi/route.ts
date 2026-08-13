import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { isValidUpiId, normalizeUpiId } from "@/lib/upi";
import {
  findParticipantByLeadId,
  updateParticipantUpi,
} from "@/server/repositories/participants.repository";

const bodySchema = z.object({
  upiId: z.string().nullable(),
});

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { leadId } = await context.params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const participant = await findParticipantByLeadId(leadId);
    if (!participant) {
      return NextResponse.json(
        { error: "Participant not found." },
        { status: 404 },
      );
    }

    const raw = parsed.data.upiId;
    let normalized: string | null = null;

    if (raw !== null && raw.trim()) {
      normalized = normalizeUpiId(raw);
      if (!isValidUpiId(normalized)) {
        return NextResponse.json(
          { error: "Invalid UPI ID format.", code: "INVALID_UPI" },
          { status: 400 },
        );
      }
    }

    const updated = await updateParticipantUpi(leadId, normalized);
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
    console.error("PATCH /api/admin/participants/[leadId]/upi failed:", error);
    return NextResponse.json(
      { error: "Failed to save UPI ID." },
      { status: 500 },
    );
  }
}
