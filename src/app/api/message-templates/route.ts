import { NextResponse } from "next/server";

import { getInstagramSocialConfig } from "@/config/social";
import { fetchEnabledMessageTemplatesForClient } from "@/server/services/message-templates.service";

export async function GET() {
  try {
    const templates = await fetchEnabledMessageTemplatesForClient();
    return NextResponse.json(
      { templates, instagram: getInstagramSocialConfig() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/message-templates failed:", error);
    return NextResponse.json(
      { error: "Failed to load message templates." },
      { status: 500 },
    );
  }
}
