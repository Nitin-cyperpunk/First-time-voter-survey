import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { parseFormType } from "@/lib/forms/types";
import {
  buildUploadDiagnostics,
  decodeUploadedHtmlBytes,
  prepareUploadedFormHtml,
  validateRegistrationHtml,
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

    const buf = new Uint8Array(await file.arrayBuffer());
    const { html: rawHtml, encoding } = decodeUploadedHtmlBytes(buf);
    const diagnostics = buildUploadDiagnostics({
      html: rawHtml,
      bytes: buf.byteLength,
      encoding,
      fileName: file.name,
    });

    console.info("[forms/upload] inspect", {
      fileName: file.name,
      bytes: buf.byteLength,
      encoding,
      checks: Object.fromEntries(
        diagnostics.checks.map((c) => [c.key, c.found]),
      ),
    });

    const validationErrors = validateRegistrationHtml(rawHtml);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: validationErrors.join(" "),
          diagnostics,
        },
        { status: 400 },
      );
    }

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
      diagnostics,
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
