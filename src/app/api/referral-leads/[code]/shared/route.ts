import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { normalizeReferralCode } from "@/lib/referral-code";
import { markShared } from "@/server/services/referral-lead.service";

const markSharedSchema = z.object({
  platform: z.enum(["whatsapp", "instagram", "copy"]),
});

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const referralCode = normalizeReferralCode(code);
    const body = await request.json();
    const parsed = markSharedSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload." },
        { status: 400 },
      );
    }

    const updated = await markShared(referralCode, parsed.data.platform);
    if (!updated) {
      return NextResponse.json(
        { error: "Referral lead not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/referral-leads/[code]/shared failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
