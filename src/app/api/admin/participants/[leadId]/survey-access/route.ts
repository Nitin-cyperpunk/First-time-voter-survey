import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { grantParticipantSurveyAccess } from "@/server/services/survey-access.service";

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { leadId } = await context.params;
    const result = await grantParticipantSurveyAccess(leadId);

    return NextResponse.json({
      success: true,
      surveyToken: result.surveyToken,
      surveyUrl: result.surveyUrl,
      surveyAccessGranted: result.surveyAccessGranted,
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
          { error: "Survey access can only be granted to eligible participants." },
          { status: 400 },
        );
      }
      if (error.message === "SURVEY_ALREADY_SUBMITTED") {
        return NextResponse.json(
          { error: "This participant has already submitted the survey." },
          { status: 400 },
        );
      }
    }

    console.error(
      "POST /api/admin/participants/[leadId]/survey-access failed:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to grant survey access." },
      { status: 500 },
    );
  }
}
