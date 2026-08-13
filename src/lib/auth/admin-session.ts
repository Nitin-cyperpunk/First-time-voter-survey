import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  ROLE_SUPER_ADMIN,
  canAccess,
  rolesInclude,
  STATUS_ACTIVE,
  type AdminCapability,
  type AdminRole,
} from "@/lib/roles";
import {
  findActiveAdminByAuthUserId,
  touchAdminLastLogin,
  type AdminUserRecord,
} from "@/server/repositories/admin-users.repository";

export type AdminUser = AdminUserRecord;

export async function getSupabaseAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("[getSupabaseAuthUser] failed:", error.message);
    return null;
  }

  return user;
}

export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const user = await getSupabaseAuthUser();
  if (!user) return null;

  return findActiveAdminByAuthUserId(user.id);
}

export async function requireAdmin(): Promise<AdminUser> {
  const user = await getSupabaseAuthUser();
  if (!user) {
    redirect("/admin/login");
  }

  const admin = await findActiveAdminByAuthUserId(user.id);
  if (!admin) {
    await signOutAdmin();
    redirect("/admin/login");
  }

  return admin;
}

export async function requireRole(
  allowed: AdminRole | AdminRole[],
): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (!rolesInclude(admin.role, allowed)) {
    redirect("/metrics");
  }
  return admin;
}

export async function requireCapability(
  capability: AdminCapability,
): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (!canAccess(admin.role, capability)) {
    redirect("/metrics");
  }
  return admin;
}

export async function requireSuperAdmin(): Promise<AdminUser> {
  return requireRole(ROLE_SUPER_ADMIN);
}

/** @deprecated Prefer getCurrentAdmin() — kept for existing API routes until withRole migration. */
export async function isAdminAuthenticated(): Promise<boolean> {
  return (await getCurrentAdmin()) !== null;
}

export async function signOutAdmin() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function completeAdminLogin(authUserId: string) {
  const admin = await findActiveAdminByAuthUserId(authUserId);
  if (!admin) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return null;
  }

  await touchAdminLastLogin(admin.id);
  return admin;
}

export function isActiveAdmin(admin: AdminUser | null): admin is AdminUser {
  return Boolean(admin && admin.status === STATUS_ACTIVE);
}
