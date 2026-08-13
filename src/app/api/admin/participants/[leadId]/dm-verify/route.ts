import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import {
  executeDmVerifyAction,
  mapDmVerifyActionError,
} from "@/server/handlers/dm-verify-action.handler";

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
    return await executeDmVerifyAction(leadId, body);
  } catch (error) {
    console.error(
      "PATCH /api/admin/participants/[leadId]/dm-verify failed:",
      error,
    );
    return NextResponse.json(
      { error: mapDmVerifyActionError(error) },
      { status: 400 },
    );
  }
}
