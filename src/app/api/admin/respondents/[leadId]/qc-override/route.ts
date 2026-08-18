import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import {
  applyQcOverride,
  listQcOverrideLog,
} from "@/server/services/qc-override.service";
import type { QcStatusValue } from "@/lib/respondents/qc-status";

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

function isQcOverrideStatus(value: unknown): value is QcStatusValue {
  return value === "pass" || value === "fail" || value === "review";
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { leadId } = await context.params;
    const log = await listQcOverrideLog(leadId);
    return NextResponse.json({ log });
  } catch (error) {
    console.error("GET qc-override-log failed:", error);
    return NextResponse.json(
      { error: "Failed to load QC override log." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { leadId } = await context.params;
    const body = await request.json();
    const override = body?.override;
    const reason = typeof body?.reason === "string" ? body.reason : "";

    if (!isQcOverrideStatus(override)) {
      return NextResponse.json(
        { error: "Override must be pass, fail, or review." },
        { status: 400 },
      );
    }

    const result = await applyQcOverride({
      leadId,
      newOverride: override,
      reason,
      admin,
    });

    return NextResponse.json({
      success: true,
      qcStatusOverride: result.qcStatusOverride,
      autoStatus: result.autoStatus,
      effectiveStatus: result.effectiveStatus,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PARTICIPANT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Participant not found." },
          { status: 404 },
        );
      }
      if (error.message === "QC_OVERRIDE_REASON_TOO_SHORT") {
        return NextResponse.json(
          {
            error:
              "A reason of at least 10 characters is required for QC overrides.",
            code: "QC_OVERRIDE_REASON_TOO_SHORT",
          },
          { status: 400 },
        );
      }
    }

    console.error("PATCH qc-override failed:", error);
    return NextResponse.json(
      { error: "Failed to apply QC override." },
      { status: 500 },
    );
  }
}
