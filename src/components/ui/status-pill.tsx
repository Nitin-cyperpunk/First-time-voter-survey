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
  lead: "bg-[#EFEBF5] text-[#8C7BA8] [&_.dot]:bg-[#8C7BA8]",
  eligible: "bg-[#E2F0EC] text-[#3E8E7E] [&_.dot]:bg-[#3E8E7E]",
  notEligible: "bg-[#EFEAEC] text-[#94838C] [&_.dot]:bg-[#94838C]",
  completed: "bg-[#E3EDF7] text-[#4A7BB5] [&_.dot]:bg-[#4A7BB5]",
  review: "bg-[#F7EEDB] text-[#A6772F] [&_.dot]:bg-[#C99449]",
  pass: "bg-[#E2F0EC] text-[#3E8E7E] [&_.dot]:bg-[#3E8E7E]",
  fail: "bg-[#F6E3E3] text-[#C25B5B] [&_.dot]:bg-[#C25B5B]",
  success: "bg-[#DEF0E6] text-[#2F7D5B] [&_.dot]:bg-[#2F7D5B]",
  pending: "bg-[#F0EAD8] text-[#9A7B3F] [&_.dot]:bg-[#C99449]",
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
