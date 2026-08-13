import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { displayDmStatus } from "@/lib/dm-verify";
import { listDmVerifyParticipants } from "@/server/repositories/dm-verify.repository";
import {
  executeDmVerifyAction,
  mapDmVerifyActionError,
} from "@/server/handlers/dm-verify-action.handler";
import { getSurveyUrlForParticipant } from "@/server/services/dm-verify.service";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const participants = await listDmVerifyParticipants();
    const rows = participants.map((participant) => ({
      leadId: participant.leadId,
      fullName: participant.fullName,
      mobile: participant.mobile,
      status: participant.status,
      createdAt: participant.createdAt.toISOString(),
      dmStatus: displayDmStatus(participant),
      verifiedAt: participant.verifiedAt?.toISOString() ?? null,
      surveyAccessGranted: participant.surveyAccessGranted,
      surveyUrl:
        participant.surveyUrl ??
        getSurveyUrlForParticipant(participant.surveyToken),
    }));

    return NextResponse.json({ participants: rows });
  } catch (error) {
    console.error("GET /api/admin/dm-verify failed:", error);
    return NextResponse.json(
      { error: "Failed to load DM & Verify queue." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const leadId = String(body?.leadId ?? "").trim();

    if (!leadId) {
      return NextResponse.json(
        { error: "leadId is required." },
        { status: 400 },
      );
    }

    return await executeDmVerifyAction(leadId, body);
  } catch (error) {
    console.error("PATCH /api/admin/dm-verify failed:", error);
    return NextResponse.json(
      { error: mapDmVerifyActionError(error) },
      { status: 400 },
    );
  }
}
