"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getNavItemByHref, type NavItem } from "@/config/navigation";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AdminUser } from "@/lib/auth/admin-session";

type AppShellProps = {
  children: React.ReactNode;
  admin: AdminUser;
  navItems: NavItem[];
};

export function AppShell({ children, admin, navItems }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const currentNav = getNavItemByHref(pathname, navItems);

  return (
    <TooltipProvider>
      <div className="flex min-h-screen min-w-0 bg-background">
        <div className="fixed inset-y-0 left-0 z-40 hidden w-16 md:block xl:w-64">
          <AppSidebar admin={admin} navItems={navItems} />
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-64 border-0 bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground/70 [&>button]:hover:text-sidebar-foreground"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <AppSidebar
              admin={admin}
              navItems={navItems}
              forceExpanded
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col md:pl-16 xl:pl-64">
          <AppHeader
            onMenuClick={() => setMobileOpen(true)}
            title={currentNav?.title ?? "Dashboard"}
            description={currentNav?.description}
          />
          <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-5 xl:p-8">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
