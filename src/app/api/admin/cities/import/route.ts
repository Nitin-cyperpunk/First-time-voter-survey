import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { canAccess } from "@/lib/roles";
import {
  commitCityImport,
  parseCityImportFile,
  previewCityImport,
  type ImportPreview,
} from "@/server/services/city-import.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || !canAccess(admin.role, "settings")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const confirm = String(form.get("confirm") ?? "") === "1";
    const previewJson = form.get("preview");

    if (confirm && typeof previewJson === "string") {
      const preview = JSON.parse(previewJson) as ImportPreview;
      const result = await commitCityImport({
        preview,
        actorId: admin.id,
        actorEmail: admin.email,
        fileName: typeof form.get("fileName") === "string"
          ? String(form.get("fileName"))
          : null,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a CSV or XLSX file." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const rows = parseCityImportFile(buffer);
    if (rows.length === 0) {
      return NextResponse.json({ error: "File has no data rows." }, { status: 400 });
    }
    const preview = await previewCityImport(rows);
    return NextResponse.json({
      ok: true,
      preview,
      fileName: file.name,
      counts: {
        add: preview.toAdd.length,
        update: preview.toUpdate.length,
        reject: preview.rejected.length,
      },
    });
  } catch (error) {
    console.error("POST /api/admin/cities/import failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 400 },
    );
  }
}
