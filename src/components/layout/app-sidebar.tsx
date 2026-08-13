"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  LayoutDashboard,
  MessageCircle,
  MessageSquareText,
  PanelTop,
  Settings,
  Share2,
  ShieldAlert,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { type NavItem } from "@/config/navigation";
import type { AdminUser } from "@/lib/auth/admin-session";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const NAV_ICON_BY_HREF: Record<string, LucideIcon> = {
  "/admin-ftv/metrics": LayoutDashboard,
  "/admin-ftv/respondents": Users,
  "/admin-ftv/dm-verify": MessageCircle,
  "/admin-ftv/terminations": ShieldAlert,
  "/admin-ftv/referrals": Share2,
  "/admin-ftv/forms": FileText,
  "/admin-ftv/message-templates": MessageSquareText,
  "/admin-ftv/payouts": Wallet,
  "/admin-ftv/settings": Settings,
  "/admin-ftv/users": UserCog,
};

function navIconForHref(href: string): LucideIcon {
  return NAV_ICON_BY_HREF[href] ?? LayoutDashboard;
}

type AppSidebarProps = {
  admin: AdminUser;
  navItems: NavItem[];
  onNavigate?: () => void;
  /** Full-width labels (mobile drawer). */
  forceExpanded?: boolean;
};

export function AppSidebar({
  admin,
  navItems,
  onNavigate,
  forceExpanded = false,
}: AppSidebarProps) {
  const pathname = usePathname();
  const collapsed = !forceExpanded;

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        forceExpanded ? "w-full" : "w-64 md:w-16 md:transition-[width] md:duration-200 xl:w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center gap-3 border-b border-sidebar-border px-4",
          collapsed && "md:justify-center md:px-2 xl:justify-start xl:px-4",
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white shadow-sm">
          <PanelTop className="size-5" />
        </div>
        <div className={cn("min-w-0", collapsed && "md:hidden xl:block")}>
          <p className="truncate text-sm font-semibold tracking-tight">
            Voters Study
          </p>
          <p className="mt-0.5 truncate text-[11px] tracking-[0.03em] text-sidebar-foreground/55">
            First-Time Voters · FTV-v1
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 px-2 py-3 xl:px-3">
        <nav className="flex flex-col">
          <p className={cn("hidden px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/45", !collapsed && "block", collapsed && "xl:block")}>
            Overview
          </p>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = navIconForHref(item.href);

            const link = (
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "mb-1 flex items-center rounded-[9px] border border-transparent font-medium transition-colors",
                  "gap-3 px-3 py-2.5 text-[13.5px]",
                  collapsed && "md:justify-center md:px-2 xl:justify-start xl:px-3",
                  isActive
                    ? "border-white/20 bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className={cn(collapsed && "md:hidden xl:inline")}>
                  {item.title}
                </span>
              </Link>
            );

            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className={cn(collapsed && "xl:hidden")}>
                  {item.title}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </ScrollArea>

      <div className={cn("p-4", collapsed && "hidden xl:block")}>
        <Separator className="mb-4 bg-sidebar-border" />
        <p className="text-xs font-medium text-sidebar-foreground">
          {admin.name}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-sidebar-foreground/45">
          {admin.email} · {admin.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
        </p>
      </div>
    </aside>
  );
}
