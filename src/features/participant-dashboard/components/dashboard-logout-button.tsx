"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  dismissToast,
  toastLoading,
  toastLoggedOut,
  toastUnexpectedError,
} from "@/lib/toast";

type DashboardLogoutButtonProps = {
  className?: string;
  variant?: "outline" | "ghost" | "default";
  size?: "default" | "sm" | "lg";
};

export function DashboardLogoutButton({
  className,
  variant = "outline",
  size = "sm",
}: DashboardLogoutButtonProps) {
  const router = useRouter();

  async function handleLogout() {
    const loadingId = toastLoading("Signing out...");

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      dismissToast(loadingId);
      toastLoggedOut();
      router.replace("/login");
      router.refresh();
    } catch {
      dismissToast(loadingId);
      toastUnexpectedError();
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => void handleLogout()}
    >
      <LogOutIcon className="size-4" />
      Logout
    </Button>
  );
}
