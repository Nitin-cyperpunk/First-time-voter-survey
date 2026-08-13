import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { parseFormType } from "@/lib/forms/types";
import {
  prepareUploadedFormHtml,
  validateUploadedHtmlFile,
} from "@/lib/forms/html-upload";
import { createUploadedFormVersion } from "@/server/repositories/forms.repository";

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const formType = parseFormType(formData.get("formType"));
    const name = String(formData.get("name") ?? "").trim();
    const file = formData.get("file");

    if (!name) {
      return NextResponse.json(
        { error: "Form name is required." },
        { status: 400 },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "HTML file is required." },
        { status: 400 },
      );
    }

    validateUploadedHtmlFile({
      fileName: file.name,
      size: file.size,
    });

    const rawHtml = await file.text();
    const htmlContent = prepareUploadedFormHtml(rawHtml, formType);
    const formVersion = await createUploadedFormVersion(formType, {
      name,
      htmlContent,
      uploadedFileName: file.name,
    });

    return NextResponse.json({
      success: true,
      formType,
      version: formVersion.version,
    });
  } catch (error) {
    console.error("POST /api/admin/forms/upload failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload form.",
      },
      { status: 400 },
    );
  }
}
