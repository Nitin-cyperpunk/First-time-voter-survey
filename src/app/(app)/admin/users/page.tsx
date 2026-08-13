import { AdminUsersManager } from "@/components/admin/admin-users-manager";
import { requireSuperAdmin } from "@/lib/auth/admin-session";
import { listAdminUsers } from "@/server/repositories/admin-users.repository";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const currentAdmin = await requireSuperAdmin();
  const admins = await listAdminUsers();

  return (
    <AdminUsersManager
      currentAdminId={currentAdmin.id}
      initialAdmins={admins.map((admin) => ({
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
        createdAt: admin.createdAt,
        lastLoginAt: admin.lastLoginAt,
      }))}
    />
  );
}
