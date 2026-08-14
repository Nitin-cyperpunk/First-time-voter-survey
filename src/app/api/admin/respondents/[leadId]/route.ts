import { NextResponse } from "next/server";
import { z } from "zod";

import { withSuperAdmin } from "@/lib/auth/api-guard";
import {
  RespondentDeleteError,
  softDeleteRespondent,
} from "@/server/services/respondent-delete.service";

export const dynamic = "force-dynamic";

const deleteSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const DELETE = withSuperAdmin<{ leadId: string }>(
  async (request, context) => {
    try {
      const { leadId } = await context.params;
      const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
      if (!parsed.success) {
        return NextResponse.json(
          { error: "A short delete reason is required." },
          { status: 400 },
        );
      }

      const slot = await softDeleteRespondent({
        leadId,
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
      console.error("DELETE /api/admin/respondents/[leadId] failed:", error);
      return NextResponse.json(
        { error: "Failed to delete respondent." },
        { status: 500 },
      );
    }
  },
);
