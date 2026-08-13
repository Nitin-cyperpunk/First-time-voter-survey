import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { requestParticipantSurveyRefill } from "@/server/services/survey-access.service";

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { leadId } = await context.params;
    const body = await request.json();
    const reason = String(body?.reason ?? "").trim();

    if (!reason) {
      return NextResponse.json(
        { error: "A refill reason is required." },
        { status: 400 },
      );
    }

    const result = await requestParticipantSurveyRefill(leadId, reason);

    return NextResponse.json({
      success: true,
      surveyToken: result.surveyToken,
      surveyUrl: result.surveyUrl,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PARTICIPANT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Participant not found." },
          { status: 404 },
        );
      }
      if (error.message === "NOT_ELIGIBLE") {
        return NextResponse.json(
          { error: "Participant is not eligible for survey refill." },
          { status: 400 },
        );
      }
      if (error.message === "SURVEY_ACCESS_NOT_GRANTED") {
        return NextResponse.json(
          {
            error:
              "Please Grant Survey first, then you can request a survey refill.",
          },
          { status: 400 },
        );
      }
      if (error.message === "SCREENER_REFILL_ACTIVE") {
        return NextResponse.json(
          {
            error:
              "This participant has an active screener refill. Complete that before requesting a survey refill.",
          },
          { status: 400 },
        );
      }
      if (error.message === "SURVEY_ALREADY_SUBMITTED") {
        return NextResponse.json(
          {
            error:
              "This participant already submitted the survey. Survey refill is only available before submission.",
          },
          { status: 400 },
        );
      }
      if (error.message === "SURVEY_TOKEN_GENERATION_FAILED") {
        return NextResponse.json(
          { error: "Could not generate a secure survey link. Try again." },
          { status: 500 },
        );
      }
    }

    console.error(
      "POST /api/admin/participants/[leadId]/survey-refill-request failed:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to request survey refill." },
      { status: 500 },
    );
  }
}
