import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { parseFormType } from "@/lib/forms/types";
import { setActiveFormVersion } from "@/server/repositories/forms.repository";

function mapFormActionError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Failed to update active form.";
  }

  switch (error.message) {
    case "FORM_VERSION_NOT_FOUND":
      return "That form version does not exist.";
    case "FORM_VERSION_NOT_PUBLISHED":
      return "Publish the form version before making it active.";
    case "INVALID_HTML_FILE_PATH":
      return "This form version has no previewable HTML.";
    default:
      return "Failed to update active form.";
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const formType = parseFormType(body?.formType);
    const version = Number(body?.version);

    if (!Number.isInteger(version) || version < 1) {
      return NextResponse.json(
        { error: "A valid form version is required." },
        { status: 400 },
      );
    }

    await setActiveFormVersion(formType, version);
    return NextResponse.json({
      success: true,
      formType,
      activeVersion: version,
    });
  } catch (error) {
    console.error("POST /api/admin/forms/active failed:", error);
    return NextResponse.json(
      { error: mapFormActionError(error) },
      { status: 400 },
    );
  }
}
