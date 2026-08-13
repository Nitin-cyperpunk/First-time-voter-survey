import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import {
  STATUS_ACTIVE,
  type AdminRole,
  type AdminStatus,
} from "@/lib/roles";

type AdminUserRow = Database["public"]["Tables"]["admin_users"]["Row"];

export type AdminUserRecord = {
  id: string;
  authUserId: string;
  name: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  lastLoginAt: string | null;
};

function mapAdminUser(row: AdminUserRow): AdminUserRecord {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    name: row.name,
    email: row.email,
    role: row.role as AdminRole,
    status: row.status as AdminStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    lastLoginAt: row.last_login_at,
  };
}

export async function findAdminUserByAuthUserId(authUserId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapAdminUser(data) : null;
}

export async function findAdminUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("*")
    .eq("email", normalized)
    .maybeSingle();

  if (error) throw error;
  return data ? mapAdminUser(data) : null;
}

export async function touchAdminLastLogin(adminId: string) {
  const { error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", adminId);

  if (error) throw error;
}

export async function findActiveAdminByAuthUserId(authUserId: string) {
  const admin = await findAdminUserByAuthUserId(authUserId);
  if (!admin || admin.status !== STATUS_ACTIVE) return null;
  return admin;
}

export async function listAdminUsers() {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapAdminUser);
}

export async function findAdminUserById(id: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapAdminUser(data) : null;
}

type AdminUserInsert = Database["public"]["Tables"]["admin_users"]["Insert"];

export async function insertAdminUser(input: AdminUserInsert) {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .insert(input)
    .select("*")
    .single();

  if (error) throw error;
  return mapAdminUser(data);
}

export async function updateAdminUserStatus(id: string, status: AdminStatus) {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapAdminUser(data);
}

export async function updateAdminUserRole(id: string, role: AdminRole) {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({ role })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapAdminUser(data);
}
