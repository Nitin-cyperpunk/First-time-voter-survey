import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { getParticipantMasterRecord } from "@/server/repositories/participant-master.repository";

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { leadId } = await context.params;
    const record = await getParticipantMasterRecord(leadId);

    if (!record) {
      return NextResponse.json(
        { error: "Participant not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ...record,
      participant: {
        ...record.participant,
        createdAt: record.participant.createdAt.toISOString(),
      },
      screener: record.screener
        ? {
            ...record.screener,
            startedAt: record.screener.startedAt?.toISOString() ?? null,
            submittedAt: record.screener.submittedAt.toISOString(),
          }
        : null,
      survey: record.survey
        ? {
            ...record.survey,
            startedAt: record.survey.startedAt?.toISOString() ?? null,
            submittedAt: record.survey.submittedAt.toISOString(),
          }
        : null,
      statusHistory: record.statusHistory.map((entry) => ({
        ...entry,
        changedAt: entry.changedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/participants/[leadId] failed:", error);
    return NextResponse.json(
      { error: "Failed to load participant." },
      { status: 500 },
    );
  }
}
