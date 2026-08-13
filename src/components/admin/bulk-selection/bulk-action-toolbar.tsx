"use client";

import { MoreHorizontalIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type BulkAction = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "outline" | "destructive";
  hidden?: boolean;
};

type BulkActionToolbarProps = {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
  className?: string;
};

export function BulkActionToolbar({
  selectedCount,
  actions,
  onClear,
  className,
}: BulkActionToolbarProps) {
  if (selectedCount <= 0) return null;

  const visibleActions = actions.filter((action) => !action.hidden);

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={cn(
        "fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-4xl animate-in fade-in slide-in-from-bottom-4 flex-col gap-3 rounded-[14px] border border-border bg-card p-4 shadow-lg sm:inset-x-6 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-sm font-semibold text-foreground">
        {selectedCount.toLocaleString()} selected
      </p>

      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {visibleActions.map((action) => (
          <BulkActionButton key={action.id} action={action} />
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClear}
          className="text-plum-muted"
        >
          <XIcon className="size-4" />
          Clear Selection
        </Button>
      </div>

      <div className="flex items-center gap-2 sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <MoreHorizontalIcon className="size-4" />
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {visibleActions.map((action) => (
              <DropdownMenuItem
                key={action.id}
                disabled={action.disabled}
                onClick={action.onClick}
                className={
                  action.variant === "destructive"
                    ? "text-destructive focus:text-destructive"
                    : undefined
                }
              >
                {action.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear}>Clear Selection</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function BulkActionButton({ action }: { action: BulkAction }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={action.variant ?? "outline"}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </Button>
  );
}
