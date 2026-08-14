import { requireAdmin } from "@/lib/auth/admin-session";
import { navItemsForRole } from "@/config/navigation";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const admin = await requireAdmin();
  const navItems = navItemsForRole(admin.role);

  return (
    <AppShell admin={admin} navItems={navItems}>
      {children}
    </AppShell>
  );
}