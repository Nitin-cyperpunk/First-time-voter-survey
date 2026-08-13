import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { parseFormType } from "@/lib/forms/types";
import { setFormVersionPublished } from "@/server/repositories/forms.repository";

function mapPublishError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Failed to update publish status.";
  }

  switch (error.message) {
    case "FORM_VERSION_NOT_FOUND":
      return "That form version does not exist.";
    case "INVALID_HTML_FILE_PATH":
      return "This form version has no previewable HTML.";
    default:
      return "Failed to update publish status.";
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
    const published = body?.published === true;

    if (!Number.isInteger(version) || version < 1) {
      return NextResponse.json(
        { error: "A valid form version is required." },
        { status: 400 },
      );
    }

    await setFormVersionPublished(formType, version, published);
    return NextResponse.json({ success: true, formType, version, published });
  } catch (error) {
    console.error("POST /api/admin/forms/publish failed:", error);
    return NextResponse.json(
      { error: mapPublishError(error) },
      { status: 400 },
    );
  }
}
