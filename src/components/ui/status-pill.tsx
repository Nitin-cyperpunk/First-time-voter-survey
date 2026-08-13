import type React from "react";

import { cn } from "@/lib/utils";

export type StatusPillVariant =
  | "lead"
  | "eligible"
  | "notEligible"
  | "completed"
  | "review"
  | "pass"
  | "fail"
  | "success"
  | "pending";

type StatusPillProps = {
  children: React.ReactNode;
  variant?: StatusPillVariant;
  className?: string;
};

const variantClasses: Record<StatusPillVariant, string> = {
  lead: "bg-accent-soft text-text-muted [&_.dot]:bg-text-muted",
  eligible: "bg-accent-soft text-primary [&_.dot]:bg-primary",
  notEligible: "bg-accent-soft text-text-muted [&_.dot]:bg-text-muted",
  completed: "bg-accent-soft text-text-primary [&_.dot]:bg-text-primary",
  review: "bg-accent-soft text-text-body [&_.dot]:bg-text-body",
  pass: "bg-accent-soft text-primary [&_.dot]:bg-primary",
  fail: "bg-error/10 text-error [&_.dot]:bg-error",
  success: "bg-accent-soft text-primary [&_.dot]:bg-primary",
  pending: "bg-accent-soft text-text-body [&_.dot]:bg-text-muted",
};

export function StatusPill({
  children,
  variant = "lead",
  className,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-none",
        variantClasses[variant],
        className,
      )}
    >
      <span className="dot size-1.5 rounded-full" />
      {children}
    </span>
  );
}
