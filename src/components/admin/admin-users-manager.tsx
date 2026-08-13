"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ROLE_ADMIN, ROLE_SUPER_ADMIN, type AdminRole } from "@/lib/roles";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastSuccess,
} from "@/lib/toast";

export type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
};

type AdminUsersManagerProps = {
  initialAdmins: AdminUserListItem[];
  currentAdminId: string;
};

export function AdminUsersManager({
  initialAdmins,
  currentAdminId,
}: AdminUsersManagerProps) {
  const [admins, setAdmins] = useState(initialAdmins);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>(ROLE_ADMIN);
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sortedAdmins = useMemo(
    () =>
      [...admins].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [admins],
  );

  async function refreshAdmins() {
    const response = await fetch("/api/admin/users");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to refresh admin list.");
    }
    setAdmins(payload.admins ?? []);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    const loadingId = toastLoading("Creating admin...");

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, password }),
      });
      const payload = await response.json();
      dismissToast(loadingId);

      if (!response.ok) {
        toastError("Create failed", { description: payload.error });
        return;
      }

      toastSuccess("Admin created");
      setName("");
      setEmail("");
      setPassword("");
      setRole(ROLE_ADMIN);
      await refreshAdmins();
    } catch {
      dismissToast(loadingId);
      toastError("Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function patchAdmin(
    id: string,
    body: Record<string, string>,
    successMessage: string,
  ) {
    setBusyId(id);
    const loadingId = toastLoading("Updating...");

    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      dismissToast(loadingId);

      if (!response.ok) {
        toastError("Update failed", { description: payload.error });
        return;
      }

      toastSuccess(successMessage, {
        description: payload.message,
      });
      await refreshAdmins();
    } catch {
      dismissToast(loadingId);
      toastError("Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[14px] border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">Create Admin</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Provisions a Supabase Auth user and an active admin_users row.
        </p>

        <form onSubmit={handleCreate} className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-plum-muted">Name</label>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm font-semibold text-plum-muted">Email</label>
            <Input
              className="mt-1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-plum-muted">Role</label>
            <Select
              className="mt-1"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
            >
              <option value={ROLE_ADMIN}>Admin</option>
              <option value={ROLE_SUPER_ADMIN}>Super Admin</option>
            </Select>
          </div>
          <div>
            <label className="text-sm font-semibold text-plum-muted">
              Temporary password
            </label>
            <Input
              className="mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Admin"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-[14px] border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">Admin Accounts</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Role</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAdmins.map((admin) => {
                const isSelf = admin.id === currentAdminId;
                const busy = busyId === admin.id;

                return (
                  <tr key={admin.id} className="border-b border-border/70">
                    <td className="px-2 py-3 font-medium">{admin.name}</td>
                    <td className="px-2 py-3">{admin.email}</td>
                    <td className="px-2 py-3">{admin.role}</td>
                    <td className="px-2 py-3">{admin.status}</td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-2">
                        {admin.status === "INACTIVE" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void patchAdmin(admin.id, { action: "activate" }, "Admin activated")
                            }
                          >
                            Activate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || isSelf}
                            onClick={() =>
                              void patchAdmin(admin.id, { action: "deactivate" }, "Admin deactivated")
                            }
                          >
                            Deactivate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || isSelf}
                          onClick={() =>
                            void patchAdmin(
                              admin.id,
                              {
                                action: "change_role",
                                role:
                                  admin.role === ROLE_SUPER_ADMIN
                                    ? ROLE_ADMIN
                                    : ROLE_SUPER_ADMIN,
                              },
                              "Role updated",
                            )
                          }
                        >
                          Toggle role
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void patchAdmin(
                              admin.id,
                              { action: "reset_password" },
                              "Password reset sent",
                            )
                          }
                        >
                          Reset password
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
