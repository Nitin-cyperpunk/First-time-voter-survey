import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import {
  fetchMessageTemplatesForAdmin,
  saveMessageTemplates,
} from "@/server/services/message-templates.service";

function mapSaveError(error: unknown) {
  if (!(error instanceof Error)) return "Failed to save message templates.";
  if (error.message === "MESSAGE_TEMPLATES_MIGRATION_PENDING") {
    return "Message templates migration is pending. Run supabase/migrations/022_form_settings_message_templates.sql in Supabase.";
  }
  return error.message || "Failed to save message templates.";
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const templates = await fetchMessageTemplatesForAdmin();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("GET /api/admin/message-templates failed:", error);
    return NextResponse.json(
      { error: "Failed to load message templates." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const templates = await saveMessageTemplates(body?.templates);
    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error("PUT /api/admin/message-templates failed:", error);
    return NextResponse.json({ error: mapSaveError(error) }, { status: 400 });
  }
}
