import { getAppUrl } from "@/lib/app-url";
import {
  ROLE_ADMIN,
  ROLE_SUPER_ADMIN,
  STATUS_ACTIVE,
  STATUS_INACTIVE,
  type AdminRole,
} from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  findAdminUserByEmail,
  findAdminUserById,
  insertAdminUser,
  updateAdminUserRole,
  updateAdminUserStatus,
  type AdminUserRecord,
} from "@/server/repositories/admin-users.repository";

export class AdminUserServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AdminUserServiceError";
  }
}

export type CreateAdminAccountInput = {
  name: string;
  email: string;
  role: AdminRole;
  password: string;
  createdBy: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function assertValidRole(role: string): asserts role is AdminRole {
  if (role !== ROLE_SUPER_ADMIN && role !== ROLE_ADMIN) {
    throw new AdminUserServiceError("Invalid admin role.", "INVALID_ROLE");
  }
}

export async function createAdminAccount(
  input: CreateAdminAccountInput,
): Promise<AdminUserRecord> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (name.length < 2) {
    throw new AdminUserServiceError("Name is required.", "VALIDATION_ERROR");
  }
  if (!email || !password || password.length < 8) {
    throw new AdminUserServiceError(
      "Email and a password of at least 8 characters are required.",
      "VALIDATION_ERROR",
    );
  }

  assertValidRole(input.role);

  const existing = await findAdminUserByEmail(email);
  if (existing) {
    throw new AdminUserServiceError(
      "An admin with this email already exists.",
      "DUPLICATE_EMAIL",
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    throw new AdminUserServiceError(
      authError?.message ?? "Failed to create auth user.",
      "AUTH_CREATE_FAILED",
    );
  }

  try {
    return await insertAdminUser({
      auth_user_id: authData.user.id,
      name,
      email,
      role: input.role,
      status: STATUS_ACTIVE,
      created_by: input.createdBy,
    });
  } catch (error) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw error;
  }
}

export async function setAdminAccountStatus(
  adminId: string,
  status: typeof STATUS_ACTIVE | typeof STATUS_INACTIVE,
) {
  const admin = await findAdminUserById(adminId);
  if (!admin) {
    throw new AdminUserServiceError("Admin not found.", "NOT_FOUND");
  }

  return updateAdminUserStatus(adminId, status);
}

export async function changeAdminAccountRole(adminId: string, role: AdminRole) {
  assertValidRole(role);

  const admin = await findAdminUserById(adminId);
  if (!admin) {
    throw new AdminUserServiceError("Admin not found.", "NOT_FOUND");
  }

  return updateAdminUserRole(adminId, role);
}

export async function resetAdminPassword(adminId: string) {
  const admin = await findAdminUserById(adminId);
  if (!admin) {
    throw new AdminUserServiceError("Admin not found.", "NOT_FOUND");
  }

  const supabase = getSupabaseAdmin();
  const redirectTo = `${getAppUrl()}/admin/login`;
  const { error } = await supabase.auth.resetPasswordForEmail(admin.email, {
    redirectTo,
  });

  if (error) {
    throw new AdminUserServiceError(
      error.message,
      "PASSWORD_RESET_FAILED",
    );
  }

  return { email: admin.email };
}
