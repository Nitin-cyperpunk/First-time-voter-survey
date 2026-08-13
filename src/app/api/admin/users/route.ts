import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withSuperAdmin } from "@/lib/auth/api-guard";
import { ROLE_ADMIN, ROLE_SUPER_ADMIN } from "@/lib/roles";
import { listAdminUsers } from "@/server/repositories/admin-users.repository";
import {
  AdminUserServiceError,
  createAdminAccount,
} from "@/server/services/admin-users.service";

const createAdminSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  role: z.enum([ROLE_SUPER_ADMIN, ROLE_ADMIN]),
  password: z.string().min(8),
});

export const GET = withSuperAdmin(async () => {
  try {
    const admins = await listAdminUsers();
    return NextResponse.json({
      admins: admins.map((admin) => ({
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
        createdAt: admin.createdAt,
        lastLoginAt: admin.lastLoginAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/users failed:", error);
    return NextResponse.json(
      { error: "Failed to load admin users." },
      { status: 500 },
    );
  }
});

export const POST = withSuperAdmin(async (request, { admin }) => {
  try {
    const body = await request.json();
    const parsed = createAdminSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const created = await createAdminAccount({
      ...parsed.data,
      createdBy: admin.id,
    });

    return NextResponse.json(
      {
        admin: {
          id: created.id,
          name: created.name,
          email: created.email,
          role: created.role,
          status: created.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AdminUserServiceError) {
      const status =
        error.code === "DUPLICATE_EMAIL"
          ? 409
          : error.code === "VALIDATION_ERROR"
            ? 400
            : 500;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }

    console.error("POST /api/admin/users failed:", error);
    return NextResponse.json(
      { error: "Failed to create admin user." },
      { status: 500 },
    );
  }
});
