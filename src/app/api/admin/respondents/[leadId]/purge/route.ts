import { NextResponse } from "next/server";
import { z } from "zod";

import { withSuperAdmin } from "@/lib/auth/api-guard";
import {
  RespondentDeleteError,
  purgeRespondent,
} from "@/server/services/respondent-delete.service";

export const dynamic = "force-dynamic";

const purgeSchema = z.object({
  confirmLeadId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500),
});

export const POST = withSuperAdmin<{ leadId: string }>(
  async (request, context) => {
    try {
      const { leadId } = await context.params;
      const parsed = purgeSchema.safeParse(await request.json().catch(() => ({})));
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Type the respondent id and a short reason to purge." },
          { status: 400 },
        );
      }

      const slot = await purgeRespondent({
        leadId,
        confirmLeadId: parsed.data.confirmLeadId,
        reason: parsed.data.reason,
        admin: context.admin,
      });

      return NextResponse.json({ ok: true, slot });
    } catch (error) {
      if (error instanceof RespondentDeleteError) {
        return NextResponse.json(
          { error: error.message, code: error.code, details: error.details },
          { status: error.status },
        );
      }
      console.error("POST /api/admin/respondents/[leadId]/purge failed:", error);
      return NextResponse.json(
        { error: "Failed to purge respondent." },
        { status: 500 },
      );
    }
  },
);
