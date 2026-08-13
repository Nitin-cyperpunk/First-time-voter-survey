import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type DashboardLayoutProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardLayout({ children, className }: DashboardLayoutProps) {
  return (
    <div className={cn("min-h-screen bg-background px-4 py-12", className)}>
      <div className="mx-auto max-w-lg space-y-5">{children}</div>
    </div>
  );
}
