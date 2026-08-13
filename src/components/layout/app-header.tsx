"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  dismissToast,
  toastLoading,
  toastSuccess,
  toastUnexpectedError,
} from "@/lib/toast";

type AppHeaderProps = {
  onMenuClick: () => void;
  title: string;
  description?: string;
};

export function AppHeader({ onMenuClick, title, description }: AppHeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    const loadingId = toastLoading("Signing out...");

    try {
      await fetch("/api/admin/logout", { method: "POST" });
      dismissToast(loadingId);
      toastSuccess("👋 Logged Out Successfully");
      router.push("/admin/login");
      router.refresh();
    } catch {
      dismissToast(loadingId);
      toastUnexpectedError();
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card">
      <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 md:px-5 xl:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 md:hidden"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
          >
            <span className="text-sm">☰</span>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-[-0.01em] text-foreground xl:text-[17px]">
              {title}
            </h1>
            {description ? (
              <p className="truncate text-xs text-muted-foreground">
                Enamor Study · {description}
              </p>
            ) : null}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-9 w-9 shrink-0 rounded-full p-0"
            >
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                  AD
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Admin</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
