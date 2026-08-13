import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { isEligibilityValue } from "@/lib/participant-lifecycle";
import { setAdminEligibility } from "@/server/services/eligibility-override.service";

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { leadId } = await context.params;
    const body = await request.json();
    const eligibility = body?.eligibility;
    const reason = String(body?.reason ?? "").trim();

    if (!isEligibilityValue(eligibility)) {
      return NextResponse.json(
        { error: "eligibility must be 'eligible' or 'not_eligible'." },
        { status: 400 },
      );
    }

    const result = await setAdminEligibility(leadId, eligibility, reason);

    return NextResponse.json({
      success: true,
      status: result.status,
      eligibilityManualOverride: result.eligibilityManualOverride,
      eligibilityOverrideReason: result.eligibilityOverrideReason,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PARTICIPANT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Participant not found." },
          { status: 404 },
        );
      }
      if (error.message === "ELIGIBILITY_LOCKED") {
        return NextResponse.json(
          {
            error:
              "Eligibility cannot be changed after the survey has been submitted.",
          },
          { status: 400 },
        );
      }
      if (error.message === "INVALID_TRANSITION") {
        return NextResponse.json(
          { error: "This eligibility change is not allowed." },
          { status: 400 },
        );
      }
      if (error.message === "ELIGIBILITY_CLOSED") {
        return NextResponse.json(
          {
            error:
              "Eligibility is closed for this study. Open eligibility in Settings before marking participants eligible.",
          },
          { status: 400 },
        );
      }
    }

    console.error(
      "PATCH /api/admin/participants/[leadId]/eligibility failed:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to update eligibility." },
      { status: 500 },
    );
  }
}
