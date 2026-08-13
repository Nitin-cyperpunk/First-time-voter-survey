import { NextResponse } from "next/server";

import { getActivePublishedForm } from "@/server/repositories/forms.repository";

export async function GET() {
  try {
    const form = await getActivePublishedForm("registration");
    if (!form) {
      return NextResponse.json(
        { error: "No active form version" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      formType: form.formType,
      version: form.version,
      name: form.name,
      schema: form.schema,
    });
  } catch (error) {
    console.error("GET /api/form/active failed:", error);
    return NextResponse.json(
      { error: "Failed to load registration form" },
      { status: 500 },
    );
  }
}
