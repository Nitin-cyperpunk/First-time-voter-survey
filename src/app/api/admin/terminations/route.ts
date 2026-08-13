import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import {
  getFormTerminationById,
  listFormTerminations,
  listTerminationFilterOptions,
} from "@/server/repositories/form-terminations.repository";
import { getParticipantMasterRecord } from "@/server/repositories/participant-master.repository";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const params = request.nextUrl.searchParams;
    const id = params.get("id");

    if (id) {
      const termination = await getFormTerminationById(id);
      if (!termination) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }

      const master = await getParticipantMasterRecord(termination.leadId);

      return NextResponse.json({
        termination,
        screener: master?.screener ?? null,
        survey: master?.survey ?? null,
        participant: master?.participant ?? null,
      });
    }

    const [rows, filterOptions] = await Promise.all([
      listFormTerminations({
        formType: params.get("formType") ?? undefined,
        ruleKey: params.get("ruleKey") ?? undefined,
        questionKey: params.get("questionKey") ?? undefined,
        status: params.get("status") ?? undefined,
        leadId: params.get("leadId") ?? undefined,
        search: params.get("search") ?? undefined,
        fromDate: params.get("fromDate") ?? undefined,
        toDate: params.get("toDate") ?? undefined,
      }),
      listTerminationFilterOptions(),
    ]);

    return NextResponse.json({ rows, filterOptions });
  } catch (error) {
    console.error("GET /api/admin/terminations failed:", error);
    return NextResponse.json(
      { error: "Failed to load terminations." },
      { status: 500 },
    );
  }
}
