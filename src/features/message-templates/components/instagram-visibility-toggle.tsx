"use client";

import { cn } from "@/lib/utils";
import type { InstagramVisibility } from "@/lib/instagram";

type InstagramVisibilityToggleProps = {
  value: InstagramVisibility;
  disabled?: boolean;
  onChange: (value: InstagramVisibility) => void;
};

export function InstagramVisibilityToggle({
  value,
  disabled = false,
  onChange,
}: InstagramVisibilityToggleProps) {
  return (
    <div
      role="group"
      aria-label="Instagram account visibility"
      className="inline-flex h-6 overflow-hidden rounded-full border border-border bg-muted/40 p-0.5"
      onClick={(event) => event.stopPropagation()}
    >
      {(["public", "private"] as const).map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            className={cn(
              "rounded-full px-2 text-[10px] font-semibold capitalize leading-none transition-colors",
              "h-5 disabled:pointer-events-none disabled:opacity-50",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-plum-muted hover:text-foreground",
            )}
            onClick={() => onChange(option)}
          >
            {option === "public" ? "Public" : "Private"}
          </button>
        );
      })}
    </div>
  );
}
