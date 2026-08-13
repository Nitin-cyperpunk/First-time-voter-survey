import { NextResponse } from "next/server";

import { parseFormType } from "@/lib/forms/types";
import { getActivePublishedForm } from "@/server/repositories/forms.repository";

type RouteContext = {
  params: Promise<{ formType: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { formType: raw } = await context.params;
    const formType = parseFormType(raw);
    const form = await getActivePublishedForm(formType);

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
    console.error("GET /api/form/[formType]/active failed:", error);
    return NextResponse.json(
      { error: "Failed to load active form" },
      { status: 500 },
    );
  }
}
