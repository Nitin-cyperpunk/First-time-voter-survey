import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { parseFormType } from "@/lib/forms/types";
import { getFormVersionForPreview } from "@/server/repositories/forms.repository";

type PreviewRouteContext = {
  params: Promise<{ version: string }>;
};

export async function GET(request: NextRequest, context: PreviewRouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { version: versionRaw } = await context.params;
  const version = Number(versionRaw);
  const formType = parseFormType(
    request.nextUrl.searchParams.get("formType"),
  );

  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json(
      { error: "A valid form version is required." },
      { status: 400 },
    );
  }

  try {
    const form = await getFormVersionForPreview(formType, version);

    if (!form) {
      return NextResponse.json(
        { error: "Form version not found." },
        { status: 404 },
      );
    }

    if (form.htmlContent) {
      return new NextResponse(form.htmlContent, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, must-revalidate",
        },
      });
    }

    return NextResponse.json(
      { error: "Form version has no previewable HTML." },
      { status: 404 },
    );
  } catch (error) {
    console.error("GET /api/admin/forms/[version]/preview failed:", error);
    return NextResponse.json(
      { error: "Failed to preview form version." },
      { status: 500 },
    );
  }
}
