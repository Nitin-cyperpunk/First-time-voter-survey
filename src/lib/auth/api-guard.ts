import { NextRequest, NextResponse } from "next/server";

import { ROLE_SUPER_ADMIN, rolesInclude, type AdminRole } from "@/lib/roles";
import { getCurrentAdmin, type AdminUser } from "@/lib/auth/admin-session";

export type AppRouteContext<
  TParams extends Record<string, string> = Record<string, never>,
> = {
  params: Promise<TParams>;
};

type GuardedContext<TParams extends Record<string, string>> =
  AppRouteContext<TParams> & { admin: AdminUser };

type RouteHandler<TParams extends Record<string, string>> = (
  request: NextRequest,
  context: GuardedContext<TParams>,
) => Promise<NextResponse> | NextResponse;

export function withRole<
  TParams extends Record<string, string> = Record<string, never>,
>(allowed: AdminRole | AdminRole[], handler: RouteHandler<TParams>) {
  return async (
    request: NextRequest,
    context: AppRouteContext<TParams>,
  ): Promise<NextResponse> => {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!rolesInclude(admin.role, allowed)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const mergedContext = {
      ...context,
      admin,
    } as GuardedContext<TParams>;

    return handler(request, mergedContext);
  };
}

export function withAdmin<
  TParams extends Record<string, string> = Record<string, never>,
>(handler: RouteHandler<TParams>) {
  return async (
    request: NextRequest,
    context: AppRouteContext<TParams>,
  ): Promise<NextResponse> => {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const mergedContext = {
      ...context,
      admin,
    } as GuardedContext<TParams>;

    return handler(request, mergedContext);
  };
}

export function withSuperAdmin<
  TParams extends Record<string, string> = Record<string, never>,
>(handler: RouteHandler<TParams>) {
  return withRole(ROLE_SUPER_ADMIN, handler);
}
