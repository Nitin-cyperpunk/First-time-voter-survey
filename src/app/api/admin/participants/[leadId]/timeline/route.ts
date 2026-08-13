import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { getParticipantTimeline } from "@/server/services/timeline.service";

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { leadId } = await context.params;
    const events = await getParticipantTimeline(leadId);

    return NextResponse.json({
      events: events.map((event) => ({
        ...event,
        timestamp: event.timestamp.toISOString(),
      })),
    });
  } catch (error) {
    console.error(
      "GET /api/admin/participants/[leadId]/timeline failed:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to load timeline." },
      { status: 500 },
    );
  }
}
