import { NextResponse } from "next/server";
import { z } from "zod";

import { withSuperAdmin } from "@/lib/auth/api-guard";
import {
  ROLE_ADMIN,
  ROLE_SUPER_ADMIN,
  STATUS_ACTIVE,
  STATUS_INACTIVE,
} from "@/lib/roles";
import {
  AdminUserServiceError,
  changeAdminAccountRole,
  resetAdminPassword,
  setAdminAccountStatus,
} from "@/server/services/admin-users.service";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("deactivate") }),
  z.object({
    action: z.literal("change_role"),
    role: z.enum([ROLE_SUPER_ADMIN, ROLE_ADMIN]),
  }),
  z.object({ action: z.literal("reset_password") }),
]);

export const PATCH = withSuperAdmin<{ id: string }>(async (request, context) => {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    if (parsed.data.action === "activate") {
      const admin = await setAdminAccountStatus(id, STATUS_ACTIVE);
      return NextResponse.json({ admin });
    }

    if (parsed.data.action === "deactivate") {
      if (context.admin.id === id) {
        return NextResponse.json(
          { error: "You cannot deactivate your own account." },
          { status: 400 },
        );
      }
      const admin = await setAdminAccountStatus(id, STATUS_INACTIVE);
      return NextResponse.json({ admin });
    }

    if (parsed.data.action === "change_role") {
      if (context.admin.id === id) {
        return NextResponse.json(
          { error: "You cannot change your own role." },
          { status: 400 },
        );
      }
      const admin = await changeAdminAccountRole(id, parsed.data.role);
      return NextResponse.json({ admin });
    }

    const result = await resetAdminPassword(id);
    return NextResponse.json({
      success: true,
      message: `Password reset email sent to ${result.email}.`,
    });
  } catch (error) {
    if (error instanceof AdminUserServiceError) {
      const status = error.code === "NOT_FOUND" ? 404 : 500;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }

    console.error("PATCH /api/admin/users/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to update admin user." },
      { status: 500 },
    );
  }
});
