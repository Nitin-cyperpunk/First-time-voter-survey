import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createReferralLead,
  ReferralValidationError,
} from "@/server/services/referral-lead.service";

const createReferralLeadSchema = z.object({
  fullName: z.string(),
  mobile: z.string(),
  city: z.string(),
  area: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  dob: z.string(),
  referredBy: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createReferralLeadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload." },
        { status: 400 },
      );
    }

    const result = await createReferralLead(parsed.data);
    return NextResponse.json(result, { status: result.alreadyExists ? 200 : 201 });
  } catch (error) {
    if (error instanceof ReferralValidationError) {
      return NextResponse.json(
        { error: "Validation failed.", errors: error.errors },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === "REFERRAL_CODE_GENERATION_FAILED") {
      return NextResponse.json(
        { error: "Could not generate a referral code. Please try again." },
        { status: 500 },
      );
    }

    console.error("POST /api/referral-leads failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
