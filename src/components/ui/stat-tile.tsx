import type React from "react";

import { cn } from "@/lib/utils";

type StatTileProps = {
  label: string;
  value: React.ReactNode;
  description?: string;
  variant?: "default" | "accent" | "warn";
};

const accentClasses = {
  default: "before:bg-primary before:opacity-50",
  accent: "before:bg-primary before:opacity-100",
  warn: "before:bg-accent-hover before:opacity-100",
};

export function StatTile({
  label,
  value,
  description,
  variant = "default",
}: StatTileProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[14px] border border-border bg-card p-5 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        accentClasses[variant],
      )}
    >
      <p className="text-3xl font-bold leading-none tracking-[-0.02em] text-foreground">
        {value}
      </p>
      <p className="mt-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      {description ? (
        <p className="mt-1 text-[11.5px] text-plum-muted">{description}</p>
      ) : null}
    </div>
  );
}
