import { NextResponse } from "next/server";
import { z } from "zod";

import { withSuperAdmin } from "@/lib/auth/api-guard";
import {
  RespondentDeleteError,
  restoreRespondent,
} from "@/server/services/respondent-delete.service";

export const dynamic = "force-dynamic";

const restoreSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  confirmOverCapacity: z.boolean().optional(),
});

export const POST = withSuperAdmin<{ leadId: string }>(
  async (request, context) => {
    try {
      const { leadId } = await context.params;
      const parsed = restoreSchema.safeParse(await request.json().catch(() => ({})));
      if (!parsed.success) {
        return NextResponse.json(
          { error: "A short restore reason is required." },
          { status: 400 },
        );
      }

      const slot = await restoreRespondent({
        leadId,
        reason: parsed.data.reason,
        admin: context.admin,
        confirmOverCapacity: parsed.data.confirmOverCapacity,
      });

      return NextResponse.json({ ok: true, slot });
    } catch (error) {
      if (error instanceof RespondentDeleteError) {
        return NextResponse.json(
          { error: error.message, code: error.code, details: error.details },
          { status: error.status },
        );
      }
      console.error("POST /api/admin/respondents/[leadId]/restore failed:", error);
      return NextResponse.json(
        { error: "Failed to restore respondent." },
        { status: 500 },
      );
    }
  },
);
