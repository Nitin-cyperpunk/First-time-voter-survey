import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { normalizeInstagramId } from "@/lib/instagram";
import {
  findParticipantByLeadId,
  updateParticipantInstagramId,
  updateParticipantInstagramVisibility,
} from "@/server/repositories/participants.repository";

const bodySchema = z
  .object({
    instagramId: z.string().nullable().optional(),
    instagramVisibility: z.enum(["public", "private"]).optional(),
  })
  .refine(
    (value) =>
      value.instagramId !== undefined || value.instagramVisibility !== undefined,
    { message: "instagramId or instagramVisibility is required." },
  );

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { leadId } = await context.params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const participant = await findParticipantByLeadId(leadId);
    if (!participant) {
      return NextResponse.json(
        { error: "Participant not found." },
        { status: 404 },
      );
    }

    let updated = participant;

    if (parsed.data.instagramId !== undefined) {
      const raw = parsed.data.instagramId;
      let normalized: string | null = null;

      if (raw !== null) {
        const trimmed = raw.trim();
        if (trimmed) {
          const result = normalizeInstagramId(trimmed);
          if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: 400 });
          }
          normalized = result.username;
        }
      }

      const next = await updateParticipantInstagramId(leadId, normalized);
      if (!next) {
        return NextResponse.json(
          { error: "Participant not found." },
          { status: 404 },
        );
      }
      updated = next;
    }

    if (parsed.data.instagramVisibility !== undefined) {
      const next = await updateParticipantInstagramVisibility(
        leadId,
        parsed.data.instagramVisibility,
      );
      if (!next) {
        return NextResponse.json(
          { error: "Participant not found." },
          { status: 404 },
        );
      }
      updated = next;
    }

    return NextResponse.json({
      success: true,
      instagramId: updated.instagramId,
      instagramVisibility: updated.instagramVisibility,
    });
  } catch (error) {
    console.error("PATCH /api/admin/participants/[leadId]/instagram-id failed:", error);
    return NextResponse.json(
      { error: "Failed to save Instagram ID." },
      { status: 500 },
    );
  }
}
